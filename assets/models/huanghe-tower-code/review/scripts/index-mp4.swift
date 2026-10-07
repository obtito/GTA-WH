import Foundation
import AVFoundation
let source=CommandLine.arguments[1],destination=CommandLine.arguments[2]
let asset=AVURLAsset(url:URL(fileURLWithPath:source))
let sem=DispatchSemaphore(value:0)
Task {
 do {
  let duration=try await asset.load(.duration)
  print("Source duration: \(CMTimeGetSeconds(duration))")
  guard let exporter=AVAssetExportSession(asset:asset,presetName:AVAssetExportPresetPassthrough) else { fatalError("No MP4 exporter") }
  exporter.outputURL=URL(fileURLWithPath:destination);exporter.outputFileType = .mp4;exporter.shouldOptimizeForNetworkUse=true
  await exporter.export()
  print("Export status \(exporter.status.rawValue) error \(String(describing:exporter.error))")
  sem.signal()
 } catch { print(error);sem.signal() }
}
sem.wait()
