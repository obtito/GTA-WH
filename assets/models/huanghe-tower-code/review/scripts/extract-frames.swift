import Foundation
import AVFoundation
import AppKit
let asset=AVURLAsset(url:URL(fileURLWithPath:CommandLine.arguments[1]))
let generator=AVAssetImageGenerator(asset:asset);generator.appliesPreferredTrackTransform=true;generator.requestedTimeToleranceBefore = .zero;generator.requestedTimeToleranceAfter = .zero
for t in [12,20,28,37,45] {
 do {let cg=try generator.copyCGImage(at:CMTime(seconds:Double(t),preferredTimescale:600),actualTime:nil);let bitmap=NSBitmapImageRep(cgImage:cg);let data=bitmap.representation(using:.png,properties:[:])!;try data.write(to:URL(fileURLWithPath:CommandLine.arguments[2]+"/video-\(t)s.png"));print(t)} catch {print(error)}
}
