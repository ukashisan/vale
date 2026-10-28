import SwiftUI

@main
struct ValeMakerApp: App {
    var body: some Scene {
        WindowGroup {
            GameMakerView()
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

struct GameMakerView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebViewController { WebViewController() }
    func updateUIViewController(_ controller: WebViewController, context: Context) {}
}
