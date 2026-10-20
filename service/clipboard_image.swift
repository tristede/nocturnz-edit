// Read only after an explicit Paste action. No polling or network access.
import AppKit
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(message.utf8))
    exit(1)
}
guard CommandLine.arguments.count == 2 else { fail("Destination manquante.") }
let board = NSPasteboard.general
let image: NSImage?
if let data = board.data(forType: .png) ?? board.data(forType: .tiff) {
    guard data.count <= 64 * 1024 * 1024 else { fail("Image trop volumineuse (64 Mo maximum).") }
    image = NSImage(data: data)
} else if let urls = board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL],
          let url = urls.first, url.isFileURL,
          ["png", "jpg", "jpeg", "tiff", "tif", "webp", "heic"].contains(url.pathExtension.lowercased()) {
    let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? Int.max
    guard size <= 64 * 1024 * 1024 else { fail("Image trop volumineuse (64 Mo maximum).") }
    image = NSImage(contentsOf: url)
} else {
    image = nil
}
guard let source = image else { fail("Copie une image PNG ou JPEG, puis colle-la ici.") }
guard source.size.width > 0, source.size.height > 0,
      source.size.width <= 32768, source.size.height <= 32768,
      source.size.width * source.size.height <= 100_000_000 else { fail("Dimensions d’image trop grandes.") }
guard let tiff = source.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
      bitmap.pixelsWide <= 32768, bitmap.pixelsHigh <= 32768,
      Double(bitmap.pixelsWide) * Double(bitmap.pixelsHigh) <= 100_000_000,
      let png = bitmap.representation(using: .png, properties: [:]),
      png.count <= 64 * 1024 * 1024 else { fail("Cette image ne peut pas être convertie en PNG.") }
do {
    let destination = URL(fileURLWithPath: CommandLine.arguments[1])
    try png.write(to: destination, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
    let output: [String: Any] = ["width": bitmap.pixelsWide, "height": bitmap.pixelsHigh, "bytes": png.count]
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output))
} catch { fail("Impossible d’enregistrer l’image : \(error.localizedDescription)") }
