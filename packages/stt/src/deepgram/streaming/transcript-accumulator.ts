interface Segment {
  confidence: number;
  diarizationIndex: number;
  duration: number;
  start: number;
  text: string;
}

export class TranscriptAccumulator {
  private text = "";
  private confidence = 0;
  private count = 0;
  private start = 0;
  private end = 0;
  private diarizationIndex = -1;

  append(segment: Segment): string {
    this.text = this.text ? `${this.text} ${segment.text}` : segment.text;
    this.confidence += segment.confidence;
    this.count++;
    if (this.count === 1) {
      this.start = segment.start;
    }
    const end = segment.start + (segment.duration ?? 0);
    if (end > this.end) {
      this.end = end;
    }
    if (segment.diarizationIndex >= 0) {
      this.diarizationIndex = segment.diarizationIndex;
    }
    return this.text;
  }

  partialText(text: string): string {
    return this.text && !text.startsWith(this.text)
      ? `${this.text} ${text}`
      : text;
  }

  finish(final: Segment): Segment {
    const segment =
      this.count > 0
        ? {
            text: `${this.text} ${final.text}`,
            confidence: (this.confidence + final.confidence) / (this.count + 1),
            start: this.start,
            duration:
              Math.max(this.end, final.start + final.duration) - this.start,
            diarizationIndex: this.diarizationIndex,
          }
        : final;
    this.reset();
    return segment;
  }

  flush(): Segment | null {
    if (!this.text) {
      return null;
    }
    const segment = {
      text: this.text,
      confidence: this.count > 0 ? this.confidence / this.count : 0,
      start: this.start,
      duration: this.end > this.start ? this.end - this.start : 0,
      diarizationIndex: this.diarizationIndex,
    };
    this.reset();
    return segment;
  }

  private reset(): void {
    this.text = "";
    this.confidence = 0;
    this.count = 0;
    this.start = 0;
    this.end = 0;
    this.diarizationIndex = -1;
  }
}
