'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { BarChart2, Activity, TrendingUp, ShieldCheck, PieChart, Users, ChevronRight, Zap, Crown, LogIn, Layers, Percent, HelpCircle, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';

interface FundamentalTablesTabProps {
  snapshot: any;
}

export const FundamentalTablesTab: React.FC<FundamentalTablesTabProps> = ({ snapshot }) => {
  const locale = useLocale();
  const { user, role } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Access Control: Se requiere rol PRO_USER o ADMIN para interactuar
  const hasAccess = role === 'PRO_USER' || role === 'ADMIN';

  if (!snapshot) return null;

  const tablesObj = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
  const estimatesObj = snapshot.analystEstimates && typeof snapshot.analystEstimates === 'object' ? snapshot.analystEstimates : null;
  const scoresObj = snapshot.scores && typeof snapshot.scores === 'object' ? snapshot.scores : {};

  const [activeTab, setActiveTab] = useState<string>('all');

  // Orden exacto de tabs solicitado
  const tabs = [
    {
      id: 'all',
      label: locale === 'es' ? 'Todos' : 'All',
      icon: Layers,
      score: null,
    },
    {
      id: 'keyMetrics',
      label: locale === 'es' ? 'Key Metrics' : 'Key Metrics',
      icon: BarChart2,
      score: null,
    },
    {
      id: 'estimates',
      label: locale === 'es' ? 'Proyecciones Wall St.' : 'Wall St. Forecasts',
      icon: Users,
      score: null,
    },
    {
      id: 'valuation',
      label: locale === 'es' ? 'Valuation' : 'Valuation',
      icon: PieChart,
      score: scoresObj.valuation ?? null,
    },
    {
      id: 'growth',
      label: locale === 'es' ? 'Crecimiento' : 'Growth',
      icon: TrendingUp,
      score: scoresObj.growth ?? null,
    },
    {
      id: 'profitability',
      label: locale === 'es' ? 'Rentabilidad' : 'Profitability',
      icon: Activity,
      score: scoresObj.profitability ?? null,
    },
    {
      id: 'financialStrength',
      label: locale === 'es' ? 'Fuerza Financiera' : 'Financial Strength',
      icon: ShieldCheck,
      score: scoresObj.financialStrength ?? null,
    },
    {
      id: 'momentum',
      label: locale === 'es' ? 'Momento' : 'Momentum',
      icon: Zap,
      score: scoresObj.momentum ?? null,
    },
    {
      id: 'dividends',
      label: locale === 'es' ? 'Dividendos' : 'Dividends',
      icon: Percent,
      score: null,
    },
  ];

  // Orden de claves para el tab "Todos" y mapa por tab individual
  const ALLOWED_KEYS_ORDERED = ['keyMetrics', 'valuation', 'growth', 'profitability', 'financialStrength', 'liquidity', 'momentum', 'dividends'];

  const sectionMapping: Record<string, { title: string; keys: string[] }> = {
    keyMetrics: {
      title: locale === 'es' ? 'Key Metrics' : 'Key Metrics',
      keys: ['keyMetrics'],
    },
    valuation: {
      title: locale === 'es' ? 'Múltiples & Valuación' : 'Valuation Multiples',
      keys: ['valuation'],
    },
    growth: {
      title: locale === 'es' ? 'Crecimiento (Growth Rank)' : 'Growth Rank',
      keys: ['growth'],
    },
    profitability: {
      title: locale === 'es' ? 'Rentabilidad & Eficiencia' : 'Profitability & Efficiency',
      keys: ['profitability'],
    },
    financialStrength: {
      title: locale === 'es' ? 'Fuerza Financiera & Liquidez' : 'Financial Strength & Liquidity',
      keys: ['financialStrength', 'liquidity'],
    },
    momentum: {
      title: locale === 'es' ? 'Momento Técnico (Momentum)' : 'Technical Momentum',
      keys: ['momentum'],
    },
    dividends: {
      title: locale === 'es' ? 'Dividendos' : 'Dividends',
      keys: ['dividends'],
    },
  };

  // Filas permitidas en la tabla Valuation (las demás se ocultan)
  const VALUATION_ALLOWED_ROWS = new Set([
    'PE Ratio',
    'Forward PE Ratio',
    'PE Ratio without NRI',
    'Shiller PE Ratio',
    'PEG Ratio',
    'PS Ratio',
    'PB Ratio',
    'Price-to-Tangible-Book',
    'Price-to-Free-Cash-Flow',
    'Price-to-Operating-Cash-Flow',
    'EV-to-EBIT',
    'EV-to-EBITDA',
    'EV-to-Revenue',
    'EV-to-FCF',
    'Price-to-Projected-FCF',
  ]);

  const parsePercent = (val: string | undefined): number | null => {
    if (!val) return null;
    const num = parseFloat(val.replace('%', ''));
    return isNaN(num) ? null : num;
  };

  const formatNumberWithCommas = (val: any): string => {
    if (val === null || val === undefined || val === '') return 'N/A';
    const strVal = String(val).trim();
    const match = strVal.match(/^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/);
    if (!match) return strVal;
    const [, prefix, numStr, suffix] = match;
    const num = parseFloat(numStr);
    if (isNaN(num)) return strVal;

    const parts = numStr.split('.');
    const integerPart = Math.abs(parseInt(parts[0], 10)).toLocaleString('en-US');
    const decimalPart = parts[1] !== undefined ? `.${parts[1]}` : '';
    const sign = num < 0 ? '-' : '';

    return `${prefix}${sign}${integerPart}${decimalPart}${suffix}`;
  };

  // Guía didáctica exhaustiva para inversores novatos (explicación + ejemplo positivo/negativo)
  const INDICATOR_EXPLANATIONS: Record<string, { descEs: string; descEn: string; positiveEs: string; positiveEn: string; negativeEs: string; negativeEn: string }> = {
    'PE Ratio': {
      descEs: 'Relación Precio/Ganancia (PER). Indica cuántos dólares pagan los inversores por cada $1 de ganancia anual.',
      descEn: 'Price to Earnings Ratio. Indicates how much investors pay per $1 of annual earnings.',
      positiveEs: '🟢 Un PER moderado/bajo (12x - 20x) o alineado al crecimiento indica que la acción está a buen precio.',
      positiveEn: '🟢 A moderate/low P/E (12x - 20x) relative to growth indicates a fair/bargain valuation.',
      negativeEs: '🔴 Un PER muy elevado (>50x) sin alto crecimiento significa que está sobrevalorada o hay especulación.',
      negativeEn: '🔴 A very high P/E (>50x) without rapid growth indicates overvaluation or high speculative risk.',
    },
    'Forward PE Ratio': {
      descEs: 'PER estimado con las ganancias esperadas para los próximos 12 meses.',
      descEn: 'P/E estimated using expected earnings for the next 12 months.',
      positiveEs: '🟢 Si el Forward PE es menor que el PE actual, se anticipa que las ganancias de la empresa van a crecer.',
      positiveEn: '🟢 If Forward P/E is lower than current P/E, analysts project company earnings to grow.',
      negativeEs: '🔴 Si es mayor que el PE actual, proyectan caídas en la rentabilidad de la empresa.',
      negativeEn: '🔴 If higher than current P/E, expected future earnings are contracting.',
    },
    'PEG Ratio': {
      descEs: 'Compara el PER con la tasa de crecimiento del negocio. Mide si la valuación está justificada por el crecimiento.',
      descEn: 'Compares P/E ratio with earnings growth rate to see if price is justified by growth.',
      positiveEs: '🟢 Un PEG menor a 1.0 se considera una oportunidad de compra (crecimiento barato).',
      positiveEn: '🟢 A PEG under 1.0 is considered an attractive growth-at-a-reasonable-price opportunity.',
      negativeEs: '🔴 Un PEG mayor a 2.0 indica que se está pagando demasiado por el crecimiento esperado.',
      negativeEn: '🔴 A PEG over 2.0 suggests you are overpaying for future growth.',
    },
    'PS Ratio': {
      descEs: 'Precio / Ventas. Mide cuánto vale la empresa respecto a todo lo que factura.',
      descEn: 'Price to Sales Ratio. Measures market cap relative to total revenue.',
      positiveEs: '🟢 P/S bajo (< 2x) sugiere que genera abundantes ingresos por cada dólar de mercado.',
      positiveEn: '🟢 Low P/S (< 2x) implies strong revenue generation relative to market cap.',
      negativeEs: '🔴 P/S extremadamente alto (>10x) requiere márgenes casi perfectos para justificarse.',
      negativeEn: '🔴 Very high P/S (>10x) requires flawless profit margins to be sustained.',
    },
    'PB Ratio': {
      descEs: 'Precio / Valor Contable (Libros). Compara el precio de mercado con los activos netos de la empresa.',
      descEn: 'Price to Book Ratio. Compares market value to net tangible assets.',
      positiveEs: '🟢 P/B cercano o menor a 1.5x sugiere que la acción cotiza cerca del valor real de sus propiedades/activos.',
      positiveEn: '🟢 P/B near or below 1.5x implies trading close to the actual liquidation/net asset value.',
      negativeEs: '🔴 P/B muy alto indica que la valoración depende enteramente de intangibles o expectativa futura.',
      negativeEn: '🔴 Excessively high P/B means value is heavily dependent on intangible brand value or expectations.',
    },
    'Price-to-Free-Cash-Flow': {
      descEs: 'Precio / Flujo de Caja Libre. Evalúa cuánto efectivo real disponible genera el negocio tras todos sus gastos.',
      descEn: 'Price to Free Cash Flow. Evaluates actual surplus cash generated after all capital expenditures.',
      positiveEs: '🟢 P/FCF bajo (< 15x) significa que el negocio produce gran flujo de dinero utilizable para recompras o dividendos.',
      positiveEn: '🟢 Low P/FCF (< 15x) shows high real cash generation available for dividends or share buybacks.',
      negativeEs: '🔴 P/FCF muy alto o negativo indica que el negocio quema efectivo o le cuesta convertir ventas en dinero real.',
      negativeEn: '🔴 High or negative P/FCF shows cash burn or inefficient conversion of sales into actual cash.',
    },
    'ROE %': {
      descEs: 'Retorno sobre el Capital Propio. Mide qué tan eficiente es la directiva generando ganancias con el dinero de los accionistas.',
      descEn: 'Return on Equity. Measures management efficiency in generating profits from shareholders equity.',
      positiveEs: '🟢 ROE por encima del 15% - 20% señala una empresa altamente eficiente con ventajas competitivas.',
      positiveEn: '🟢 ROE above 15% - 20% demonstrates superior capital allocation and competitive moats.',
      negativeEs: '🔴 ROE bajo (< 5%) o negativo muestra ineficiencia o destrucción de valor del capital.',
      negativeEn: '🔴 Low (< 5%) or negative ROE points to capital inefficiency or value destruction.',
    },
    'ROA %': {
      descEs: 'Retorno sobre Activos Totales. Mide cuánta ganancia genera la empresa por cada dólar de activo que posee.',
      descEn: 'Return on Assets. Measures net income generated per dollar of total corporate assets.',
      positiveEs: '🟢 ROA superior al 7% - 10% refleja un excelente uso de la maquinaria, fábricas o infraestructura.',
      positiveEn: '🟢 ROA above 7% - 10% indicates excellent utilization of physical assets and infrastructure.',
      negativeEs: '🔴 ROA muy bajo indica activos ociosos o demasiado capital atrapado sin rendimiento.',
      negativeEn: '🔴 Very low ROA signals unproductive capital trapped in low-yielding assets.',
    },
    'Operating Margin %': {
      descEs: 'Margen Operativo. Porcentaje de los ingresos que queda como ganancia limpia del negocio principal.',
      descEn: 'Operating Margin. Percentage of revenue converted into profit from core business operations.',
      positiveEs: '🟢 Margen > 20% evidencia gran poder de fijación de precios y resiliencia ante inflación.',
      positiveEn: '🟢 Margen > 20% displays pricing power and strong economic resilience against inflation.',
      negativeEs: '🔴 Margen < 5% deja a la empresa muy vulnerable si suben sus costos de producción.',
      negativeEn: '🔴 Margen < 5% leaves the business vulnerable to cost spikes or minor economic downturns.',
    },
    'Net Margin %': {
      descEs: 'Margen Neto. Porcentaje de beneficio final que va al bolsillo tras pagar impuestos e intereses.',
      descEn: 'Net Margin. Percentage of final net profit remaining after paying taxes, interest, and expenses.',
      positiveEs: '🟢 Margen neto en crecimiento constante demuestra salud financiera y disciplina de costos.',
      positiveEn: '🟢 Expanding net margins show superior cost discipline and robust overall financial health.',
      negativeEs: '🔴 Márgenes en contracción o negativos advierten sobre pérdidas netas y posible necesidad de deuda.',
      negativeEn: '🔴 Contracting or negative net margins warn of losses and potential dilution or debt risks.',
    },
    'Gross Margin %': {
      descEs: 'Margen Bruto. Ganancia que queda tras restar únicamente los costos directos de fabricación/servicio.',
      descEn: 'Gross Margin. Revenue remaining after deducting direct production/service delivery costs.',
      positiveEs: '🟢 Margen bruto alto (>50%) permite invertir fuertemente en innovación, marketing y expansión.',
      positiveEn: '🟢 High gross margins (>50%) provide substantial buffer for R&D, marketing, and expansion.',
      negativeEs: '🔴 Margen bruto comprimido limita la capacidad de competir sin caer en pérdidas.',
      negativeEn: '🔴 Compressed gross margins severely limit competitive flexibility during price wars.',
    },
    'Moat Score': {
      descEs: 'Ventaja Competitiva (Moat). Mide la capacidad de la empresa para defender su cuota de mercado e ingresos frente a competidores (patentes, marca, costes de cambio).',
      descEn: 'Economic Moat Score. Measures the company ability to protect market share and profits from competitors.',
      positiveEs: '🟢 Un puntaje alto (Wide Moat / 8-10) indica monopolio u oligopolio con altos márgenes sostenibles.',
      positiveEn: '🟢 High score (Wide Moat / 8-10) indicates strong pricing power and highly sustainable margins.',
      negativeEs: '🔴 Un puntaje bajo (No Moat / 0-4) significa que el producto es un commoditie fácil de replicar.',
      negativeEn: '🔴 Low score (No Moat / 0-4) means the product is easily replaceable with low pricing power.',
    },
    'Economic Moat': {
      descEs: 'Ventaja Competitiva (Moat). Protege a la empresa de la competencia mediante marca, patentes o economías de escala.',
      descEn: 'Economic Moat. Protects the business from competitors via brand power, patents, or scale.',
      positiveEs: '🟢 "Wide Moat" o nivel alto: la empresa domina su nicho y puede subir precios sin perder clientes.',
      positiveEn: '🟢 "Wide Moat": company dominates its market and can raise prices without losing customers.',
      negativeEs: '🔴 "No Moat": guerra de precios constante que comprime las ganancias a largo plazo.',
      negativeEn: '🔴 "No Moat": price wars that erode long-term profitability.',
    },
    'Tariff Resilience Score': {
      descEs: 'Resiliencia ante Aranceles/Tarifas. Evalúa qué tan protegida está la cadena de suministro y ventas de la empresa frente a guerras comerciales o impuestos de importación.',
      descEn: 'Tariff Resilience Score. Evaluates supply chain and sales protection against trade wars and import tariffs.',
      positiveEs: '🟢 Puntaje elevado (7-10) indica producción local o diversificada sin dependencia crítica de insumos sancionables.',
      positiveEn: '🟢 High score (7-10) shows domestic production or diversified sourcing with minimal tariff risk.',
      negativeEs: '🔴 Puntaje bajo (1-4) expone a la empresa a severa pérdida de margen si se imponen nuevos aranceles.',
      negativeEn: '🔴 Low score (1-4) exposes company margins to heavy damage from import tax hikes.',
    },
    'Debt-to-Equity': {
      descEs: 'Deuda sobre Patrimonio. Mide cuántos dólares de deuda utiliza la empresa por cada dólar aportado por los accionistas.',
      descEn: 'Debt to Equity Ratio. Measures financial leverage by comparing total liabilities to shareholder equity.',
      positiveEs: '🟢 Ratio menor a 1.5x indica balance sólido y bajo riesgo de quiebra o refinanciación costosa.',
      positiveEn: '🟢 Ratio under 1.5x indicates conservative debt management and low insolvency risk.',
      negativeEs: '🔴 Ratio mayor a 3.0x refleja apalancamiento excesivo, peligroso si suben las tasas de interés.',
      negativeEn: '🔴 Ratio over 3.0x indicates heavy leverage, vulnerable during interest rate hikes.',
    },
    'Current Ratio': {
      descEs: 'Razón de Liquidez Corriente. Mide la capacidad de pagar deudas a corto plazo (menores a 1 año) con sus activos líquidos actuales.',
      descEn: 'Current Ratio. Measures ability to cover short-term obligations (<1 year) using liquid assets.',
      positiveEs: '🟢 Ratio entre 1.5x y 2.5x garantiza solvencia inmediata sin sobrecargar efectivo ocioso.',
      positiveEn: '🟢 Ratio between 1.5x and 2.5x confirms comfortable liquidity without hoarding excess idle cash.',
      negativeEs: '🔴 Ratio menor a 1.0x advierte sobre problemas de liquidez e incapacidad de pagar deudas inminentes.',
      negativeEn: '🔴 Ratio below 1.0x signals working capital deficit and potential liquidity distress.',
    },
    'EV-to-EBITDA': {
      descEs: 'Valor de Empresa / EBITDA. Mide el costo total de adquirir el negocio entero (deuda + capital) en relación a su beneficio operativo bruto.',
      descEn: 'Enterprise Value to EBITDA. Measures total acquisition cost of the business relative to raw operating cash flow.',
      positiveEs: '🟢 EV/EBITDA bajo (< 10x) sugiere que la empresa está a precio de ganga tomando en cuenta su deuda.',
      positiveEn: '🟢 Low EV/EBITDA (< 10x) signals attractive valuation considering cash and debt obligations.',
      negativeEs: '🔴 EV/EBITDA elevado (> 20x) exige un crecimiento acelerado para no resultar en una inversión costosa.',
      negativeEn: '🔴 High EV/EBITDA (> 20x) requires aggressive growth to justify the high takeover multiple.',
    },
    'FCF Yield %': {
      descEs: 'Rendimiento del Flujo de Caja Libre. Porcentaje de efectivo real que genera la empresa en comparación con su capitalización bursátil.',
      descEn: 'Free Cash Flow Yield. Percentage of real cash generated by the business relative to market cap.',
      positiveEs: '🟢 FCF Yield > 6% - 8% es excelente; la empresa produce suficiente dinero para financiar su propio crecimiento y recomprar acciones.',
      positiveEn: '🟢 FCF Yield > 6% - 8% is outstanding; business produces ample surplus cash to self-fund and buy back shares.',
      negativeEs: '🔴 FCF Yield < 2% o negativo indica que cotiza muy cara o que su modelo requiere inyecciones constantes de capital.',
      negativeEn: '🔴 FCF Yield < 2% or negative shows expensive valuation or cash-intensive capital requirements.',
    },
    'Revenue (TTM) (Mil $)': {
      descEs: 'Ingresos Totales Acumulados (TTM). Representa la facturación bruta total generada por la empresa en los últimos 12 meses (en millones de dólares).',
      descEn: 'Total Revenue (TTM). Represents overall gross sales generated by the business over the last 12 trailing months (in millions).',
      positiveEs: '🟢 Ingresos altos y en expansión continua reflejan liderazgo de mercado, gran escala comercial y alta demanda de sus productos.',
      positiveEn: '🟢 High and growing revenue signals market leadership, strong commercial scale, and high demand.',
      negativeEs: '🔴 Ingresos estancados o en declive advierten sobre pérdida de clientes, competencia agresiva o saturación de mercado.',
      negativeEn: '🔴 Stagnant or contracting revenue signals customer attrition or market saturation.',
    },
    'EPS (TTM) ($)': {
      descEs: 'Ganancia Neta por Acción (TTM). Mide la utilidad limpia que genera la empresa por cada acción individual en los últimos 12 meses.',
      descEn: 'Earnings Per Share (TTM). Represents net profit generated per single share over the trailing 12 months.',
      positiveEs: '🟢 Un EPS positivo y creciente confirma que la empresa genera valor real para el accionista tras pagar todos los costos.',
      positiveEn: '🟢 Healthy positive EPS confirms real bottom-line value creation for shareholders after all costs.',
      negativeEs: '🔴 Un EPS negativo indica que la empresa opera en números rojos (pérdidas netas e ineficiencia de costos).',
      negativeEn: '🔴 Negative EPS indicates the company operates at a net loss.',
    },
    'Beta': {
      descEs: 'Coeficiente de Volatilidad (Beta). Mide el grado de reacción de la cotización respecto a las oscilaciones del mercado general (S&P 500 = 1.0).',
      descEn: 'Beta Coefficient. Measures stock volatility relative to the overall market benchmark (S&P 500 = 1.0).',
      positiveEs: '🟢 Beta < 1.0: la acción es defensiva y menos volátil que el mercado (ideal para amortiguar caídas).',
      positiveEn: '🟢 Beta < 1.0: defensive, low-volatility stock providing downside protection.',
      negativeEs: '🔴 Beta > 1.5: alta volatilidad (sufre movimientos y caídas mucho más drásticas que el promedio del mercado).',
      negativeEn: '🔴 Beta > 1.5: highly volatile stock with amplified price swings.',
    },
  };

  const getIndicatorExplanation = (name: string) => {
    // 1. Coincidencia exacta
    if (INDICATOR_EXPLANATIONS[name]) {
      return INDICATOR_EXPLANATIONS[name];
    }

    // 2. Coincidencia con nombre limpiando sufijos en paréntesis como (TTM), (Mil $), ($), etc.
    const cleanNameKey = name.replace(/\([^)]*\)/g, '').trim();
    if (INDICATOR_EXPLANATIONS[cleanNameKey]) {
      return INDICATOR_EXPLANATIONS[cleanNameKey];
    }

    const lowerName = name.toLowerCase();

    // 3. Coincidencia por Patrones Técnicos y Fundamentales

    // Patrón Ingresos / Revenue (ej. Revenue (TTM) (Mil $), Total Revenue, Sales)
    if (lowerName.includes('revenue') || lowerName.includes('ingresos') || lowerName.includes('sales')) {
      return {
        descEs: 'Ingresos y Facturación Bruta. Mide el volumen total de dinero generado por la venta de productos o servicios del negocio.',
        descEn: 'Total Revenue & Sales. Measures gross money generated from selling goods or services.',
        positiveEs: '🟢 Ventas elevadas y en crecimiento constante demuestran demanda saludable y fortaleza comercial.',
        positiveEn: '🟢 High and growing sales confirm strong market demand and commercial scale.',
        negativeEs: '🔴 Ventas en retroceso advierten sobre menor demanda o pérdida de cuota de mercado.',
        negativeEn: '🔴 Declining sales warn of weakening demand or market share loss.',
      };
    }

    // Patrón EPS / Benefit per Share (ej. EPS (TTM) ($), EPS without NRI)
    if (lowerName.includes('eps') || lowerName.includes('ganancia por acción') || lowerName.includes('beneficio por acción')) {
      return {
        descEs: 'Ganancia por Acción (EPS). Utilidad neta resultante dividida entre el número total de acciones en circulación.',
        descEn: 'Earnings Per Share (EPS). Net income divided by total shares outstanding.',
        positiveEs: '🟢 Un EPS sólido e impulsado al alza aumenta el valor intrínseco de cada acción.',
        positiveEn: '🟢 Strong and rising EPS increases the intrinsic value of each share.',
        negativeEs: '🔴 EPS negativo o decreciente refleja pérdidas operativas o emisión dilutiva de títulos.',
        negativeEn: '🔴 Negative or falling EPS reflects net losses or share dilution.',
      };
    }

    // Patrón RSI (ej. 5-Day RSI, 14-Day RSI, 6-Month RSI, RSI)
    if (lowerName.includes('rsi')) {
      return {
        descEs: 'Índice de Fuerza Relativa (RSI). Oscilador técnico que mide la velocidad e intensidad del impulso del precio en una escala de 0 a 100 para identificar zonas de sobrecompra o sobreventa.',
        descEn: 'Relative Strength Index (RSI). Technical momentum oscillator measuring speed and magnitude of price movements on a scale of 0 to 100 to identify overbought or oversold conditions.',
        positiveEs: '🟢 RSI en zona de Sobreventa (< 30): la acción sufrió caídas fuertes y puede estar lista para un rebote técnico al alza.',
        positiveEn: '🟢 Oversold RSI (< 30): stock suffered heavy selling and may be primed for a bullish technical bounce.',
        negativeEs: '🔴 RSI en zona de Sobrecompra (> 70): la subida ha sido acelerada e intensa, aumentando el riesgo de toma de ganancias o corrección.',
        negativeEn: '🔴 Overbought RSI (> 70): rapid price surge increases probability of profit taking or near-term pullback.',
      };
    }

    // Patrón Promedios Móviles / SMA / EMA (ej. SMA 20, 50-Day Moving Average, 200-Day SMA)
    if (lowerName.includes('sma') || lowerName.includes('moving average') || lowerName.includes('promedio móvil')) {
      return {
        descEs: 'Promedio Móvil Técnico. Mide la tendencia limpia del precio promediando los cierres durante el período seleccionado para suavizar el ruido diario.',
        descEn: 'Technical Moving Average. Tracks price trend by averaging closing prices over a specified period to smooth out short-term noise.',
        positiveEs: '🟢 Cotizar por encima del promedio móvil indica tendencia alcista sostenida e impulso comprador.',
        positiveEn: '🟢 Price trading above the moving average signals sustained bullish trend and buyer control.',
        negativeEs: '🔴 Cotizar por debajo indica tendencia bajista o presión de venta dominante en el mercado.',
        negativeEn: '🔴 Price trading below signals dominant bearish pressure or downtrend.',
      };
    }

    // Patrón Volatilidad / Beta (ej. Beta, Beta 5Y)
    if (lowerName.includes('beta')) {
      return {
        descEs: 'Coeficiente de Volatilidad (Beta). Mide el grado de reacción de la cotización respecto a las oscilaciones del mercado general (S&P 500 = 1.0).',
        descEn: 'Beta Coefficient. Measures stock volatility relative to the overall market benchmark (S&P 500 = 1.0).',
        positiveEs: '🟢 Beta < 1.0: acción defensiva y estable que amortigua las caídas bruscas del mercado.',
        positiveEn: '🟢 Beta < 1.0: defensive, low-volatility stock providing downside protection.',
        negativeEs: '🔴 Beta > 1.5: alta volatilidad (sufre movimientos mucho más agresivos y riesgosos que el mercado).',
        negativeEn: '🔴 Beta > 1.5: highly volatile stock experiencing aggressive price swings.',
      };
    }

    // Patrón ROIC / Return on Invested Capital
    if (lowerName.includes('roic')) {
      return {
        descEs: 'Retorno sobre el Capital Invertido (ROIC). Mide la rentabilidad real generada por la empresa por cada dólar inyectado de capital operativo y deuda.',
        descEn: 'Return on Invested Capital (ROIC). Measures efficiency in converting total invested capital into net operating profits.',
        positiveEs: '🟢 ROIC elevado (> 15%) refleja ventajas competitivas imbatibles y uso extraordinario del dinero.',
        positiveEn: '🟢 High ROIC (> 15%) reflects superior capital efficiency and economic moats.',
        negativeEs: '🔴 ROIC bajo (< 8%) significa que la empresa apenas cubre el costo financiero de su capital.',
        negativeEn: '🔴 Low ROIC (< 8%) shows poor capital allocation barely covering the cost of capital.',
      };
    }

    // Patrón Liquidez / Quick Ratio / Acid Test
    if (lowerName.includes('quick ratio') || lowerName.includes('prueba ácida')) {
      return {
        descEs: 'Prueba Ácida de Liquidez (Quick Ratio). Mide la capacidad de pagar deudas de corto plazo usando únicamente efectivo y cobros inmediatos sin vender inventario.',
        descEn: 'Quick Ratio (Acid Test). Measures ability to settle immediate liabilities using only liquid cash and receivables without selling inventory.',
        positiveEs: '🟢 Ratio > 1.0x asegura cobertura total de obligaciones inmediatas sin contratiempos.',
        positiveEn: '🟢 Ratio > 1.0x confirms full short-term liability coverage with zero stress.',
        negativeEs: '🔴 Ratio < 0.8x indica dependencia riesgosa de liquidar inventarios para pagar deudas.',
        negativeEn: '🔴 Ratio < 0.8x signals dangerous reliance on inventory sales to meet immediate debt.',
      };
    }

    // Patrón Cobertura de Intereses / Interest Coverage
    if (lowerName.includes('interest coverage') || lowerName.includes('cobertura de intereses')) {
      return {
        descEs: 'Cobertura de Intereses. Mide cuántas veces la ganancia operativa (EBIT) alcanza para pagar los intereses de las deudas.',
        descEn: 'Interest Coverage Ratio. Measures how many times operating income (EBIT) covers annual interest payments.',
        positiveEs: '🟢 Cobertura alta (> 5x) garantiza que la deuda está bajo control y no ahoga el negocio.',
        positiveEn: '🟢 High coverage (> 5x) proves debt obligations are light and well managed.',
        negativeEs: '🔴 Cobertura baja (< 2x) expone a la empresa a severo riesgo de impago si disminuyen sus ventas.',
        negativeEn: '🔴 Low coverage (< 2x) poses severe financial distress risk during revenue contractions.',
      };
    }

    // Patrón Caja vs Deuda / Cash to Debt
    if (lowerName.includes('cash-to-debt') || lowerName.includes('cash to debt') || lowerName.includes('efectivo sobre deuda')) {
      return {
        descEs: 'Proporción Efectivo / Deuda. Compara las reservas de caja frente a toda la deuda financiera.',
        descEn: 'Cash to Debt Ratio. Compares liquid cash reserves directly against total debt liabilities.',
        positiveEs: '🟢 Ratio > 1.0x (Caja Neta) significa que la empresa podría pagar el 100% de su deuda hoy mismo.',
        positiveEn: '🟢 Ratio > 1.0x (Net Cash) means the company holds enough cash to wipe out all debt immediately.',
        negativeEs: '🔴 Deuda muy superior a la caja (< 0.2x) genera alta dependencia de refinanciaciones de bancos.',
        negativeEn: '🔴 Low ratio (< 0.2x) leaves company dependent on credit markets and refinancing terms.',
      };
    }

    // Patrón 52-Week High / 52-Week Low
    if (lowerName.includes('52-week') || lowerName.includes('52 semanas')) {
      return {
        descEs: 'Posición respecto al rango de 52 Semanas. Compara la cotización actual frente al máximo o mínimo del último año.',
        descEn: '52-Week Price Positioning. Compares current stock price against its 1-year high and low range.',
        positiveEs: '🟢 Cotizar cerca del máximo histórico reciente refleja gran impulso comprador y fortaleza.',
        positiveEn: '🟢 Trading near 52-week high indicates strong momentum and market demand.',
        negativeEs: '🔴 Cotizar en mínimos de 52 semanas puede reflejar deterioro del negocio o una oportunidad de valor profundo.',
        negativeEn: '🔴 Trading near 52-week low signals market skepticism or potential deep-value turnaround opportunity.',
      };
    }

    // Patrón Shiller PE / CAPE
    if (lowerName.includes('shiller') || lowerName.includes('cape')) {
      return {
        descEs: 'PER Shiller (CAPE). Valuación ajustada por inflación usando la media de ganancias de 10 años para eliminar la distorsión del ciclo económico.',
        descEn: 'Shiller P/E (CAPE). Inflation-adjusted valuation using 10-year average earnings to smooth out economic cycles.',
        positiveEs: '🟢 CAPE bajo (< 20x) indica que la valoración es verdaderamente atractiva a largo plazo.',
        positiveEn: '🟢 Low CAPE (< 20x) suggests long-term valuation is historically attractive.',
        negativeEs: '🔴 CAPE elevado (> 32x) alerta sobre una valoración sobrecalentada respecto a su historia.',
        negativeEn: '🔴 High CAPE (> 32x) warns of stretched historical valuation multiples.',
      };
    }

    // 4. Fallback limpio sin tautologías del tipo "mide el indicador X"
    const labelTitle = cleanNameKey || name;
    return {
      descEs: `Métrica de evaluación bursátil. Mide el comportamiento financiero y nivel de desempeño operativo de ${labelTitle}.`,
      descEn: `Financial valuation metric. Evaluates financial behavior and operational performance level for ${labelTitle}.`,
      positiveEs: `🟢 Un resultado sólido y superior a la media sectorial refleja solvencia, eficiencia o fortaleza competitiva.`,
      positiveEn: `🟢 A strong value above sector benchmark reflects solvency, efficiency, or competitive strength.`,
      negativeEs: `🔴 Un resultado débil o fuera de rango advierte sobre compresión de márgenes, valoración sobrecalentada o apalancamiento.`,
      negativeEn: `🔴 A weak or out-of-range value warns of margin compression, stretched valuation, or leverage risk.`,
    };
  };

  const renderIndicatorTable = (title: string, rows: any[], sectionKey?: string) => {
    if (!rows || rows.length === 0) return null;

    const isKeyMetrics = sectionKey === 'keyMetrics';

    return (
      <div key={title} className="flex flex-col gap-3">
        <h4 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2 border-l-4 border-emerald-400 pl-2.5 py-0.5">
          {title}
        </h4>

        <div className="overflow-x-visible border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
              <tr>
                <th className="p-3.5 pl-4 min-w-[200px]">{locale === 'es' ? 'Indicador' : 'Indicator'}</th>
                <th className="p-3.5 text-right w-32">{locale === 'es' ? 'Valor Extraído' : 'Extracted Value'}</th>
                {!isKeyMetrics && (
                  <>
                    <th className="p-3.5 w-48">{locale === 'es' ? 'Comparación Industria' : 'Industry Rank'}</th>
                    <th className="p-3.5 w-48">{locale === 'es' ? 'Historial' : 'Historical Rank'}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-sans">
              {rows.map((row: any, idx: number) => {
                const vsIndNum = parsePercent(row.vsIndustry);
                const vsHistNum = parsePercent(row.vsHistory);
                const rowKey = row.name ? `row-${row.name}-${idx}` : `row-${idx}`;

                const exp = getIndicatorExplanation(row.name);
                const desc = locale === 'es' ? exp.descEs : exp.descEn;
                const pos = locale === 'es' ? exp.positiveEs : exp.positiveEn;
                const neg = locale === 'es' ? exp.negativeEs : exp.negativeEn;

                return (
                  <tr key={rowKey} className="hover:bg-slate-900/30 transition-colors group">
                    <td className="p-3.5 pl-4 font-semibold text-slate-200 flex items-center gap-1.5">
                      <ChevronRight size={12} className="text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0" />
                      <span>{row.name}</span>
                      
                      {/* Tooltip interactivo con explicación para inversores novatos */}
                      <div className="relative group/tooltip inline-block ml-1">
                        <Info size={14} className="text-slate-500 hover:text-teal-400 cursor-pointer transition-colors shrink-0" />
                        <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 hidden w-72 sm:w-80 group-hover/tooltip:block z-[999] rounded-xl border border-slate-700 bg-slate-950 p-3.5 shadow-2xl backdrop-blur-2xl transition-all">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-2">
                            <HelpCircle size={14} className="text-teal-400 shrink-0" />
                            <span className="font-bold text-xs text-white uppercase tracking-wider">{row.name}</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed mb-2.5 whitespace-normal">
                            {desc}
                          </p>
                          <div className="flex flex-col gap-1.5 text-[10px] bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 font-sans whitespace-normal">
                            <div className="text-emerald-300 leading-snug">{pos}</div>
                            <div className="text-rose-300 leading-snug">{neg}</div>
                          </div>
                          {row.current && (
                            <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center text-[10px]">
                              <span className="text-slate-400">{locale === 'es' ? 'Valor Actual del Stock:' : 'Stock Current Value:'}</span>
                              <span className="font-mono font-bold text-teal-300">{formatNumberWithCommas(row.current)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-white text-sm">
                      {formatNumberWithCommas(row.current)}
                    </td>
                    {!isKeyMetrics && (
                      <>
                        <td className="p-3.5 font-mono">
                          {vsIndNum !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, Math.max(0, vsIndNum))}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-bold text-slate-300 w-12 text-right">
                                {row.vsIndustry}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono">
                          {vsHistNum !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, Math.max(0, vsHistNum))}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-bold text-slate-300 w-12 text-right">
                                {row.vsHistory}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[11px]">-</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderAnalystEstimatesTable = () => {
    if (!estimatesObj || !estimatesObj.years || !estimatesObj.estimates) {
      return (
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20 text-slate-500 text-xs">
          {locale === 'es' ? 'No se encontraron proyecciones futuras de analistas para esta acción.' : 'No analyst projections available for this stock.'}
        </div>
      );
    }

    const years: string[] = estimatesObj.years;
    const estimatesList: Array<{ metric: string; values: string[] }> = estimatesObj.estimates;

    return (
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2 border-l-4 border-emerald-400 pl-2.5 py-0.5">
          {locale === 'es' ? 'Proyecciones Futuras de Wall Street (Multi-Year Forecasts)' : 'Wall Street Multi-Year Financial Forecasts'}
        </h4>
        <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950/40 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-900">
              <tr>
                <th className="p-3.5 pl-4 min-w-[180px]">{locale === 'es' ? 'Métrica Promedio' : 'Forecast Metric'}</th>
                {years.map((y) => (
                  <th key={y} className="p-3.5 text-right font-mono text-teal-300">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-mono">
              {estimatesList.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                  <td className="p-3.5 pl-4 font-sans font-extrabold text-slate-200">
                    {row.metric}
                  </td>
                  {years.map((_, yearIdx) => {
                    const val = row.values[yearIdx] ?? '—';
                    return (
                      <td key={yearIdx} className="p-3.5 text-right font-bold text-white">
                        {formatNumberWithCommas(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    if (activeTab === 'estimates') {
      return renderAnalystEstimatesTable();
    }

    let keysToRender: string[];
    if (activeTab === 'all') {
      // Todos: muestra todas las tablas en el orden permitido
      keysToRender = ALLOWED_KEYS_ORDERED;
    } else {
      const mapping = sectionMapping[activeTab];
      if (!mapping) return null;
      keysToRender = mapping.keys;
    }

    const sectionsToDisplay = keysToRender
      .map((key) => {
        let rows: any[] = tablesObj[key] || [];
        // Filtrar valuation para mostrar solo las filas autorizadas
        if (key === 'valuation') {
          rows = rows.filter((r: any) => VALUATION_ALLOWED_ROWS.has(r.name));
        }
        // Filtrar profitability para ocultar "ROC (Joel Greenblatt) %"
        if (key === 'profitability') {
          rows = rows.filter((r: any) => !r.name.includes('ROC (Joel Greenblatt)'));
        }
        // Filtrar fuerza financiera (financialStrength / liquidity) para ocultar scores y WACC vs ROIC
        if (key === 'financialStrength' || key === 'liquidity') {
          const hiddenItems = ['Piotroski F-Score', 'Altman Z-Score', 'Beneish M-Score', 'WACC vs ROIC', 'WACC', 'ROIC'];
          rows = rows.filter((r: any) => !hiddenItems.some(item => r.name.includes(item)));
        }
        const title =
          activeTab === 'all'
            ? (sectionMapping[key]?.title ?? (key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')))
            : (sectionMapping[activeTab]?.title ?? key);
        return { key, title, rows };
      })
      .filter((s) => s.rows.length > 0);

    if (activeTab === 'all') {
      const analystTable = renderAnalystEstimatesTable();
      return (
        <div className="flex flex-col gap-8">
          {sectionsToDisplay.map((sec) => (
            <React.Fragment key={sec.key}>
              {renderIndicatorTable(sec.title, sec.rows, sec.key)}
              {sec.key === 'keyMetrics' && analystTable}
            </React.Fragment>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-8">
        {sectionsToDisplay.map((sec) => renderIndicatorTable(sec.title, sec.rows, sec.key))}
      </div>
    );
  };

  // VISTA DE BLOQUEO PARA USUARIOS SIN ACCESO (FREE USER O NO LOGUEADOS)
  if (!hasAccess) {
    return (
      <>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-8 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center text-center max-w-xl mx-auto py-6 gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/40 bg-purple-500/10 text-purple-400 shadow-lg shadow-purple-500/10">
              <Crown size={32} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-purple-400">
                {locale === 'es' ? 'Tablas de Fundamentos Protegidas' : 'Protected Fundamental Tables'}
              </span>
              <h3 className="text-2xl font-extrabold text-white tracking-tight">
                {locale === 'es' ? 'Análisis de Fuerza Financiera, Valuación y Rentabilidad' : 'Financial Strength, Valuation & Profitability Breakdown'}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {locale === 'es'
                  ? 'Explora las métricas fundamentales detalladas: Fuerza Financiera, Rentabilidad, Valuación, Crecimiento, Momento Técnico y Proyecciones Futuras de Wall Street.'
                  : 'Unlock detailed fundamental matrices: Financial Strength, Profitability, Valuation Multiples, Growth, Momentum, and Wall Street Forecasts.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full my-2 text-left">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-teal-400" />
                  {locale === 'es' ? 'Fuerza & Solvencia' : 'Strength & Solvency'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Ratings de deuda y liquidez' : 'Debt & liquidity ratings'}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <PieChart size={14} className="text-purple-400" />
                  {locale === 'es' ? 'Múltiples de Valuación' : 'Valuation Ratios'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Comparación frente a industria' : 'Industry rank comparison'}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-400" />
                  {locale === 'es' ? 'Estimados Wall St.' : 'Wall St. Forecasts'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {locale === 'es' ? 'Proyecciones multi-año de analistas' : 'Multi-year analyst forecasts'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full mt-2">
              {!user ? (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 via-teal-400 to-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider hover:opacity-90 transition shadow-xl shadow-purple-500/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn size={16} />
                  <span>{locale === 'es' ? 'Iniciar Sesión para Obtener Premium' : 'Sign In to Access Premium'}</span>
                </button>
              ) : (
                <button
                  onClick={() => alert(locale === 'es' ? 'Ponte en contacto con administración o actualiza a plan Premium para habilitar acceso.' : 'Contact admin or upgrade your account to Premium.')}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-500 text-white font-black text-xs uppercase tracking-widest hover:brightness-110 transition shadow-xl shadow-purple-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Crown size={16} />
                  <span>{locale === 'es' ? 'UPGRADE A PREMIUM USER' : 'UPGRADE TO PREMIUM USER'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // VISTA COMPLETA (ADMIN & PRO_USER)
  return (
    <div className="flex flex-col gap-6 p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl">
      <div className="flex flex-col gap-3">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
          {locale === 'es' ? 'Explorar Tablas Fundamentales BHT' : 'Explore BHT Fundamental Tables'}
        </span>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800 border-b border-slate-900">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 text-slate-400 border-slate-900 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
                <span>{tab.label}</span>
                {tab.score && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black font-mono transition-colors ${
                    isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-teal-400'
                  }`}>
                    {tab.score}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2">
        {renderTabContent()}
      </div>
    </div>
  );
};

