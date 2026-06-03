export class IndicatorHistory {
  constructor(
    public readonly id: string,
    public readonly indicatorId: string,
    public readonly date: Date,
    public readonly value: number,
  ) {}
}
