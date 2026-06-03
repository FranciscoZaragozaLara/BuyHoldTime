export class HistoricalPrice {
  constructor(
    public readonly id: string,
    public readonly tickerId: string,
    public readonly date: Date,
    public readonly open: number,
    public readonly high: number,
    public readonly low: number,
    public readonly close: number,
    public readonly adjClose: number,
    public readonly volume: bigint,
  ) {}
}
