export class Ticker {
  constructor(
    public readonly id: string,
    public readonly symbol: string,
    public readonly name: string,
    public readonly price: number,
    public readonly changePercent: number,
    public readonly sector: string,
    public readonly buyHoldIndex: number,
    public readonly recommendation: string,
    public readonly pe: number,
    public readonly dy: number,
    public readonly cap: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    
    // Financial Valuation Fields (Yahoo Finance)
    public readonly eps?: number | null,
    public readonly forwardPe?: number | null,
    public readonly trailingPe?: number | null,
    public readonly pegRatio?: number | null,
    public readonly enterpriseValue?: number | null,
    public readonly avgVolume?: number | null,
    public readonly fiftyTwoWeekHigh?: number | null,
    public readonly fiftyTwoWeekLow?: number | null,
    public readonly dividendRate?: number | null,
    public readonly bookValue?: number | null,
    public readonly historicalEps?: any | null,
    public readonly historicalDividends?: any | null,
    public readonly historicalEpsQuarterly?: Array<{ date: string; eps: number; source: 'real' | 'estimated' }> | null,
  ) {}
}
