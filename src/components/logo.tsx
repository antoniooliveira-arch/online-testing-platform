export default function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo-sme.png"
      alt="AvaliaLab"
      className={className ?? "h-14 w-auto"}
      style={{ objectFit: "contain" }}
    />
  );
}