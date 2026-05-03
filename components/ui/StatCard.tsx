export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ui-stat">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </div>
  );
}
