import Foundation
import WebKit

/// Native backend for app/js/storage.js. Each project is a folder in
/// Documents/Projects, visible in the Files app:
///
///     <id>/manifest.json   project manifest (+ "id")
///     <id>/src/<file>.js   source files
///     <id>/assets/<name>   binary assets
///     <id>/save.json       data the game stored with Vale.save()
///
/// Only the app page (not the sandboxed game iframe) can call this handler.
final class ProjectStore: NSObject, WKScriptMessageHandlerWithReply {
    enum StoreError: LocalizedError {
        case badRequest(String)
        var errorDescription: String? {
            switch self { case .badRequest(let why): return why }
        }
    }

    private let fm = FileManager.default
    private let root: URL
    private let namePattern = try! NSRegularExpression(pattern: "^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$")

    override init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        root = docs.appendingPathComponent("Projects", isDirectory: true)
        super.init()
        try? fm.createDirectory(at: root, withIntermediateDirectories: true)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame else { return replyHandler(nil, "Not allowed") }
        do {
            guard let body = message.body as? [String: Any], let op = body["op"] as? String else {
                throw StoreError.badRequest("Malformed request")
            }
            switch op {
            case "list": replyHandler(try list(), nil)
            case "get":
                if let project = try get(id: body["id"]) { replyHandler(project, nil) } else { replyHandler(NSNull(), nil) }
            case "put": try put(body["project"]); replyHandler(true, nil)
            case "remove": try remove(id: body["id"]); replyHandler(true, nil)
            default: throw StoreError.badRequest("Unknown op \(op)")
            }
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }

    // MARK: Operations

    private func list() throws -> [[String: Any]] {
        try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil, options: .skipsHiddenFiles).compactMap { dir in
            guard var manifest = try? readJSON(dir.appendingPathComponent("manifest.json")) else { return nil }
            manifest["id"] = dir.lastPathComponent
            return manifest
        }
    }

    private func get(id: Any?) throws -> [String: Any]? {
        let dir = try projectDir(id)
        guard fm.fileExists(atPath: dir.path) else { return nil }
        var manifest = try readJSON(dir.appendingPathComponent("manifest.json"))
        manifest.removeValue(forKey: "id")

        var files: [String: String] = [:]
        for name in manifest["files"] as? [String] ?? [] {
            files[name] = try String(contentsOf: try child(dir, "src", name), encoding: .utf8)
        }
        var assets: [String: Any] = [:]
        let types = try? readJSON(dir.appendingPathComponent("assets.json"))
        for name in manifest["assets"] as? [String] ?? [] {
            let data = try Data(contentsOf: try child(dir, "assets", name))
            assets[name] = ["type": types?[name] as? String ?? "", "data": data.base64EncodedString()]
        }
        let saveData = (try? readJSON(dir.appendingPathComponent("save.json"))) ?? [:]
        return ["id": dir.lastPathComponent, "manifest": manifest, "files": files, "assets": assets, "saveData": saveData]
    }

    /// Writes the whole project to a temporary folder, then swaps it in, so a
    /// failed write never leaves a half-saved project behind.
    private func put(_ value: Any?) throws {
        guard let project = value as? [String: Any],
              let manifest = project["manifest"] as? [String: Any] else {
            throw StoreError.badRequest("Malformed project")
        }
        let dir = try projectDir(project["id"])
        let tmp = root.appendingPathComponent(".tmp-\(UUID().uuidString)", isDirectory: true)
        defer { try? fm.removeItem(at: tmp) }
        try fm.createDirectory(at: tmp.appendingPathComponent("src"), withIntermediateDirectories: true)
        try fm.createDirectory(at: tmp.appendingPathComponent("assets"), withIntermediateDirectories: true)

        try writeJSON(manifest, to: tmp.appendingPathComponent("manifest.json"))
        for (name, text) in project["files"] as? [String: String] ?? [:] {
            try Data(text.utf8).write(to: try child(tmp, "src", name))
        }
        var types: [String: String] = [:]
        for (name, value) in project["assets"] as? [String: Any] ?? [:] {
            guard let asset = value as? [String: Any], let b64 = asset["data"] as? String,
                  let data = Data(base64Encoded: b64) else {
                throw StoreError.badRequest("Bad asset \(name)")
            }
            try data.write(to: try child(tmp, "assets", name))
            types[name] = asset["type"] as? String ?? ""
        }
        try writeJSON(types, to: tmp.appendingPathComponent("assets.json"))
        try writeJSON(project["saveData"] as? [String: Any] ?? [:], to: tmp.appendingPathComponent("save.json"))

        if fm.fileExists(atPath: dir.path) {
            _ = try fm.replaceItemAt(dir, withItemAt: tmp)
        } else {
            try fm.moveItem(at: tmp, to: dir)
        }
    }

    private func remove(id: Any?) throws {
        let dir = try projectDir(id)
        if fm.fileExists(atPath: dir.path) { try fm.removeItem(at: dir) }
    }

    // MARK: Helpers

    private func validName(_ name: String) -> Bool {
        name != "." && name != ".." &&
            namePattern.firstMatch(in: name, range: NSRange(name.startIndex..., in: name)) != nil
    }

    private func projectDir(_ id: Any?) throws -> URL {
        guard let id = id as? String, validName(id), !id.hasPrefix(".") else {
            throw StoreError.badRequest("Bad project id")
        }
        return root.appendingPathComponent(id, isDirectory: true)
    }

    private func child(_ dir: URL, _ sub: String, _ name: String) throws -> URL {
        guard validName(name) else { throw StoreError.badRequest("Bad file name \(name)") }
        return dir.appendingPathComponent(sub, isDirectory: true).appendingPathComponent(name)
    }

    private func readJSON(_ url: URL) throws -> [String: Any] {
        guard let obj = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw StoreError.badRequest("Corrupt \(url.lastPathComponent)")
        }
        return obj
    }

    private func writeJSON(_ obj: Any, to url: URL) throws {
        try JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]).write(to: url)
    }
}
