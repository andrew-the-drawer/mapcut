import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedPacket,
} from 'mediabunny'

/** Wraps mediabunny behind a simple add-chunks → finalize interface. */
export class VideoMuxer {
  private readonly target: BufferTarget
  private readonly output: Output
  private readonly videoSource: EncodedVideoPacketSource
  readonly isMP4: boolean

  constructor(fps: number) {
    this.target = new BufferTarget()
    this.isMP4 = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)

    if (this.isMP4) {
      this.output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'reserve' }),
        target: this.target,
      })
      this.videoSource = new EncodedVideoPacketSource('avc')
    } else {
      this.output = new Output({
        format: new WebMOutputFormat(),
        target: this.target,
      })
      this.videoSource = new EncodedVideoPacketSource('vp9')
    }

    this.output.addVideoTrack(this.videoSource, { frameRate: fps })
  }

  async start(): Promise<void> {
    await this.output.start()
  }

  async addVideoChunk(
    chunk: EncodedVideoChunk,
    meta?: EncodedVideoChunkMetadata,
  ): Promise<void> {
    const packet = EncodedPacket.fromEncodedChunk(chunk)
    await this.videoSource.add(
      packet,
      meta?.decoderConfig ? { decoderConfig: meta.decoderConfig } : undefined,
    )
  }

  async finalize(): Promise<Blob> {
    this.videoSource.close()
    await this.output.finalize()
    const mimeType = this.isMP4 ? 'video/mp4' : 'video/webm'
    return new Blob([this.target.buffer!], { type: mimeType })
  }
}
