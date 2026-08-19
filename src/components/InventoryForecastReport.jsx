import React, { useMemo } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Info,
  Minus,
  PackageX,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toListItems, toSentences } from "../utils/predictiveHealthParsing";
import {
  classifyStockBadges,
  computeForecastOverview,
  defaultRiskReason,
  estimateStockOutDate,
  findItemMention,
  parseForecastReport,
} from "../utils/inventoryForecastParsing";

const TREND_ICONS = {
  Increasing: TrendingUp,
  Decreasing: TrendingDown,
  Stable: Minus,
};

const STATUS_ROWS_SHOWN = 12;
const TREND_ROWS_SHOWN = 8;
const FORECAST_ROWS_SHOWN = 8;
const RISK_ROWS_SHOWN = 10;

function maxOfRow(row) {
  return Math.max(1, Number(row.used90 || 0), Number(row.used30 || 0), Number(row.estimated30 || 0));
}

function Bar({ label, value, max, unit, className }) {
  const pct = Math.max(2, Math.min(100, Math.round((Number(value || 0) / max) * 100)));
  return (
    <div className="ifr-bar-row">
      <span className="ifr-bar-label">{label}</span>
      <div className="ifr-bar-track">
        <div className={`ifr-bar-fill ${className}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="ifr-bar-value">{value} {unit}</span>
    </div>
  );
}

function StatCard({ label, value, tone = "neutral" }) {
  return (
    <div className={`ifr-stat ifr-stat-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function BadgeRow({ badges }) {
  if (!badges.length) {
    return <span className="ifr-badge ifr-badge-normal">Normal</span>;
  }
  return badges.map((badge) => (
    <span key={badge.code} className={`ifr-badge ifr-badge-${badge.code}`}>
      {badge.label}
    </span>
  ));
}

// Pure presentation for the AI inventory forecast. All fetching
// (summarizeForecastWithGroq / getInventoryForecasts) happens in
// InventoryManagementModule, which owns forecasts/forecastSummary state --
// this only renders whatever it is handed, and never calls the AI itself.
export default function InventoryForecastReport({ forecasts, summaryText }) {
  const { sections, disclaimer } = useMemo(
    () => (summaryText ? parseForecastReport(summaryText) : { sections: {}, disclaimer: "" }),
    [summaryText]
  );

  const overview = useMemo(() => computeForecastOverview(forecasts), [forecasts]);

  const trendItems = useMemo(
    () => [...(forecasts || [])].sort((a, b) => Number(b.used90 || 0) - Number(a.used90 || 0)).slice(0, TREND_ROWS_SHOWN),
    [forecasts]
  );

  const statusItems = useMemo(() => (forecasts || []).slice(0, STATUS_ROWS_SHOWN), [forecasts]);

  const forecastItems = useMemo(
    () => (forecasts || []).filter((row) => Number(row.recommended || 0) > 0).slice(0, FORECAST_ROWS_SHOWN),
    [forecasts]
  );

  const atRiskItems = useMemo(() => {
    return (forecasts || [])
      .map((row) => ({ row, badges: classifyStockBadges(row) }))
      .filter((entry) => entry.badges.length > 0)
      .slice(0, RISK_ROWS_SHOWN);
  }, [forecasts]);

  const rows = forecasts || [];

  if (!summaryText) return null;

  const conditionBullets = toSentences((sections["INVENTORY CONDITION"] || []).join(" "));
  const usageBullets = toSentences((sections["USAGE AND DEMAND ANALYSIS"] || []).join(" "));
  const restockText = (sections["RESTOCK PRIORITIES"] || []).join(" ");
  const expiryText = (sections["EXPIRY AND STOCK RISK"] || []).join(" ");
  const actionItems = toListItems(sections["RECOMMENDED ACTIONS"] || []);

  return (
    <div className="ifr">
      <div className="ifr-basis">
        <Info size={13} />
        Basis: Stock Out (POS sales and dispensed items), Medicine Usage, Expired, and Damaged transactions recorded in the past 90 days, compared with each item&apos;s current quantity and reorder level.
      </div>

      <section className="ifr-section ifr-section-full">
        <h4 className="ifr-heading"><Boxes size={14} /> Inventory Overview</h4>
        <div className="ifr-stat-grid">
          <StatCard label="Items Analyzed" value={overview.totalItems} />
          <StatCard label="Out of Stock" value={overview.outOfStock} tone="critical" />
          <StatCard label="Low Stock" value={overview.lowStock} tone="high" />
          <StatCard label="Expiring Soon" value={overview.expiringSoon} tone="moderate" />
          <StatCard label="Expired" value={overview.expired} tone="critical" />
          <StatCard label="Suggested Restock Units" value={overview.totalRecommended} tone="info" />
        </div>
        {conditionBullets.length > 0 && (
          <ul className="ifr-bullets">
            {conditionBullets.map((sentence, index) => <li key={index}>{sentence}</li>)}
          </ul>
        )}
      </section>

      <section className="ifr-section ifr-section-full">
        <h4 className="ifr-heading"><BarChart3 size={14} /> Historical Usage and Sales Trends</h4>
        {trendItems.length ? (
          <div className="ifr-trend-list">
            {trendItems.map((row) => {
              const TrendIcon = TREND_ICONS[row.usageTrend] || Minus;
              const max = maxOfRow(row);
              return (
                <div className="ifr-trend-row" key={row.id}>
                  <div className="ifr-trend-label">
                    <strong>{row.item_name}</strong>
                    <span className={`ifr-trend-badge ifr-trend-${String(row.usageTrend || "stable").toLowerCase()}`}>
                      <TrendIcon size={11} /> {row.usageTrend}
                    </span>
                  </div>
                  <div className="ifr-bars">
                    <Bar label="Used (90d)" value={row.used90} max={max} unit={row.unit} className="ifr-bar-90" />
                    <Bar label="Used (30d)" value={row.used30} max={max} unit={row.unit} className="ifr-bar-30" />
                    <Bar label="Est. next 30d" value={row.estimated30} max={max} unit={row.unit} className="ifr-bar-est" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="ifr-muted">No recorded usage history yet.</p>}
        {usageBullets.length > 0 && (
          <ul className="ifr-bullets">
            {usageBullets.map((sentence, index) => <li key={index}>{sentence}</li>)}
          </ul>
        )}
      </section>

      <section className="ifr-section">
        <h4 className="ifr-heading"><PackageX size={14} /> Current Stock Status</h4>
        <div className="ifr-status-grid">
          {statusItems.map((row) => (
            <div className="ifr-status-card" key={row.id}>
              <div className="ifr-status-head">
                <strong>{row.item_name}</strong>
                <span className="ifr-status-qty">{row.quantity} {row.unit}</span>
              </div>
              <div className="ifr-badge-row">
                <BadgeRow badges={classifyStockBadges(row)} />
              </div>
              <span className="ifr-status-meta">Reorder level: {row.reorder_level} {row.unit}</span>
            </div>
          ))}
        </div>
        {rows.length > statusItems.length && (
          <p className="ifr-more-note">+{rows.length - statusItems.length} more item(s) -- see Forecast Details table below.</p>
        )}
      </section>

      <section className="ifr-section">
        <h4 className="ifr-heading"><CalendarClock size={14} /> Demand Forecast</h4>
        {forecastItems.length ? (
          <div className="ifr-forecast-grid">
            {forecastItems.map((row) => {
              const stockOut = estimateStockOutDate(row);
              const remaining = Math.max(0, Number(row.quantity || 0) - Number(row.estimated30 || 0));
              return (
                <div className="ifr-forecast-card" key={row.id}>
                  <strong>{row.item_name}</strong>
                  <dl className="ifr-forecast-dl">
                    <div><dt>Forecast period</dt><dd>Next 30 days</dd></div>
                    <div><dt>Expected demand</dt><dd>{row.estimated30} {row.unit}</dd></div>
                    <div><dt>Est. remaining stock</dt><dd>{remaining} {row.unit}</dd></div>
                    <div><dt>Est. stock-out date</dt><dd>{stockOut.label}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>
        ) : <p className="ifr-muted">No items currently need restocking.</p>}
      </section>

      <section className="ifr-section ifr-section-full">
        <h4 className="ifr-heading"><AlertTriangle size={14} /> Items at Risk</h4>
        {atRiskItems.length ? (
          <ol className="ifr-risk-list">
            {atRiskItems.map(({ row, badges }) => {
              const reasoning = findItemMention(row.item_name, `${restockText} ${expiryText}`) || defaultRiskReason(row, badges);
              return (
                <li key={row.id}>
                  <div className="ifr-risk-head">
                    <strong>{row.item_name}</strong>
                    <BadgeRow badges={badges} />
                  </div>
                  {reasoning && <p>{reasoning}</p>}
                </li>
              );
            })}
          </ol>
        ) : <p className="ifr-muted">No items are currently flagged at risk.</p>}
      </section>

      <section className="ifr-section ifr-section-full">
        <h4 className="ifr-heading"><ClipboardList size={14} /> Recommended Actions</h4>
        {actionItems.length ? (
          <ul className="ifr-checklist">
            {actionItems.map((sentence, index) => (
              <li key={index}><CheckCircle2 size={13} /> {sentence}</li>
            ))}
          </ul>
        ) : <p className="ifr-muted">No specific actions were returned.</p>}
      </section>

      <p className="ifr-disclaimer">
        {disclaimer || "This AI inventory forecast is decision support only and must still be reviewed by authorized clinic personnel before acting."}
      </p>

      <style>{`
        .ifr{display:grid;gap:12px;width:100%;margin-top:12px;box-sizing:border-box}

        .ifr-basis{grid-column:1/-1;display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:9px;background:#eef7fb;color:#3d6373;font-size:11.5px;line-height:1.45}
        .ifr-basis svg{flex-shrink:0}

        .ifr-section{background:#fff;border:1px solid #e3edf2;border-radius:13px;padding:14px 15px;box-sizing:border-box;min-width:0}
        .ifr-section-full{grid-column:1/-1}

        .ifr-heading{display:flex;align-items:center;gap:7px;margin:0 0 10px;color:#17445a;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.3px}

        .ifr-muted{margin:0;color:#93a4ac;font-size:12.5px;line-height:1.5}

        .ifr-bullets{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:6px}
        .ifr-bullets li{position:relative;padding-left:15px;color:#324a54;font-size:12.5px;line-height:1.6;overflow-wrap:anywhere}
        .ifr-bullets li::before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;border-radius:50%;background:#4da8da}

        .ifr-checklist{margin:0;padding:0;list-style:none;display:grid;gap:8px}
        .ifr-checklist li{display:flex;align-items:flex-start;gap:7px;color:#22513b;font-size:12.5px;line-height:1.55;overflow-wrap:anywhere}
        .ifr-checklist li svg{flex-shrink:0;margin-top:2px;color:#2f8f5b}

        .ifr-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
        .ifr-stat{display:grid;gap:3px;padding:11px 12px;border-radius:10px;background:#f6fafb;border:1px solid #e6eef1}
        .ifr-stat strong{font-size:19px;color:#20313b}
        .ifr-stat span{font-size:10.5px;color:#6f7f88;text-transform:uppercase;letter-spacing:.2px}
        .ifr-stat-critical{background:#fdf1f0;border-color:#f6dad7}
        .ifr-stat-critical strong{color:#c0392b}
        .ifr-stat-high{background:#fdf1dc;border-color:#f6e4bc}
        .ifr-stat-high strong{color:#a5680b}
        .ifr-stat-moderate{background:#fdf7e6;border-color:#f3e7b9}
        .ifr-stat-moderate strong{color:#a5680b}
        .ifr-stat-info{background:#eaf8fd;border-color:#c9e8f2}
        .ifr-stat-info strong{color:#297da8}

        .ifr-trend-list{display:grid;gap:10px}
        .ifr-trend-row{padding:11px 12px;border-radius:10px;background:#fbfdfe;border:1px solid #eaf1f4}
        .ifr-trend-label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
        .ifr-trend-label strong{font-size:12.5px;color:#20313b}
        .ifr-trend-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap}
        .ifr-trend-increasing{background:#fdf1dc;color:#a5680b}
        .ifr-trend-decreasing{background:#e5f4ea;color:#2f8f5b}
        .ifr-trend-stable{background:#eef1f2;color:#657a84}

        .ifr-bars{display:grid;gap:6px}
        .ifr-bar-row{display:grid;grid-template-columns:88px 1fr auto;align-items:center;gap:8px}
        .ifr-bar-label{font-size:10.5px;color:#748993}
        .ifr-bar-track{height:7px;border-radius:999px;background:#e9f0f3;overflow:hidden}
        .ifr-bar-fill{height:100%;border-radius:999px}
        .ifr-bar-90{background:#8fb7c9}
        .ifr-bar-30{background:#4da8da}
        .ifr-bar-est{background:#f0a63c}
        .ifr-bar-value{font-size:10.5px;color:#4a5c65;white-space:nowrap;text-align:right}

        .ifr-status-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
        .ifr-status-card{display:grid;gap:7px;padding:11px 12px;border-radius:10px;background:#fbfdfe;border:1px solid #eaf1f4}
        .ifr-status-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
        .ifr-status-head strong{font-size:12.5px;color:#20313b}
        .ifr-status-qty{font-size:11.5px;color:#6f7f88;white-space:nowrap}
        .ifr-badge-row{display:flex;flex-wrap:wrap;gap:5px}
        .ifr-status-meta{font-size:10.5px;color:#8a9aa2}
        .ifr-more-note{margin:10px 0 0;font-size:11.5px;color:#8a9aa2;font-style:italic}

        .ifr-badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap}
        .ifr-badge-normal{background:#e5f4ea;color:#2f8f5b}
        .ifr-badge-low-stock{background:#fdf1dc;color:#a5680b}
        .ifr-badge-out-of-stock{background:#fbe6e4;color:#c0392b}
        .ifr-badge-overstock{background:#e7f6fc;color:#267fa9}
        .ifr-badge-near-expiry{background:#fdf7e6;color:#a5680b}
        .ifr-badge-expired{background:#f6dcdc;color:#8f2a2a}

        .ifr-forecast-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
        .ifr-forecast-card{padding:11px 12px;border-radius:10px;background:#fbfdfe;border:1px solid #eaf1f4}
        .ifr-forecast-card strong{font-size:12.5px;color:#20313b}
        .ifr-forecast-dl{margin:9px 0 0;display:grid;gap:5px}
        .ifr-forecast-dl div{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
        .ifr-forecast-dl dt{font-size:10.5px;color:#8a9aa2}
        .ifr-forecast-dl dd{margin:0;font-size:11.5px;font-weight:700;color:#324a54;text-align:right}

        .ifr-risk-list{margin:0;padding-left:19px;display:grid;gap:10px}
        .ifr-risk-list li{color:#324a54}
        .ifr-risk-head{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:4px}
        .ifr-risk-head strong{font-size:12.5px;color:#20313b}
        .ifr-risk-list p{margin:0;font-size:12px;line-height:1.55;color:#5a747e;overflow-wrap:anywhere}

        .ifr-disclaimer{grid-column:1/-1;margin:0;padding:9px 12px;border-radius:8px;background:#f5f7f8;color:#5a747e;font-size:11px;font-style:italic;line-height:1.5}

        @media (min-width:760px){
          .ifr{grid-template-columns:repeat(2,minmax(0,1fr))}
        }

        @media (max-width:640px){
          .ifr-bar-row{grid-template-columns:72px 1fr auto}
          .ifr-stat-grid{grid-template-columns:repeat(auto-fit,minmax(100px,1fr))}
        }
      `}</style>
    </div>
  );
}
