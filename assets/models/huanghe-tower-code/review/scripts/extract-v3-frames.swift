import Foundation
import AVFoundation
import AppKit
let asset=AVURLAsset(url:URL(fileURLWithPath:CommandLine.arguments[1]))
let generator=AVAssetImageGenerator(asset:asset);generator.appliesPreferredTrackTransform=true;generator.requestedTimeToleranceBefore = .zero;generator.requestedTimeToleranceAfter = .zero
for t in [2,4,5,6,10,15,20,22,27,29] {
 do {let cg=try generator.copyCGImage(at:CMTime(seconds:Double(t),preferredTimescale:600),actualTime:nil);let bitmap=NSBitmapImageRep(cgImage:cg);let data=bitmap.representation(using:.png,properties:[:])!;try data.write(to:URL(fileURLWithPath:CommandLine.arguments[2]+"/v3-video-\(t)s.png"));print(t)} catch {print(error)}
}
print("duration",CMTimeGetSeconds(asset.duration));print("fps",asset.tracks(withMediaType:.video).first?.nominalFrameRate ?? 0)
