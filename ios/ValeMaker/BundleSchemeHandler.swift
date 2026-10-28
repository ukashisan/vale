import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves files from the bundled `app` folder at `vale-app://app/<path>`.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "vale-app"
    private let root = Bundle.main.resourceURL!.appendingPathComponent("app", isDirectory: true).standardizedFileURL

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        let file = root.appendingPathComponent(path).standardizedFileURL

        // Refuse anything that resolves outside the app folder.
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!
            task.didReceive(response)
            task.didReceive(Data())
            task.didFinish()
            return
        }
        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let headers = [
            "Content-Type": file.pathExtension == "js" ? "text/javascript" : mime,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache"
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
