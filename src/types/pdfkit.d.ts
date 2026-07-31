declare module 'pdfkit' {
  import { EventEmitter } from 'events'
  import { Readable } from 'stream'

  class PDFDocument extends EventEmitter {
    constructor(options?: Record<string, unknown>)
    x: number
    y: number
    page: Record<string, unknown>
    options: Record<string, unknown>
    font(name: string): this
    fontSize(size: number): this
    fillColor(color: string): this
    text(text: string, options?: Record<string, unknown>): this
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this
    moveDown(lines?: number): this
    moveUp(lines?: number): this
    rect(x: number, y: number, width: number, height: number): this
    fill(color: string): this
    stroke(color?: string): this
    fillAndStroke(fillColor: string, strokeColor: string): this
    save(): this
    restore(): this
    addPage(options?: Record<string, unknown>): this
    switchToPage(pageIndex: number): void
    end(): void
    pipe(stream: Readable): this
    bufferedPageRange(): { start: number; count: number }
    on(event: string, listener: (...args: unknown[]) => void): this
  }

  export default PDFDocument
}
