export class Indicator {
  constructor(
    public readonly id: string,
    public readonly key: string,
    public readonly name: string,
    public readonly currentValue: number,
    public readonly unit: string,
    public readonly status: string,
    public readonly description: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
