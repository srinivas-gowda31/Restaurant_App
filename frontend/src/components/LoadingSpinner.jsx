export default function LoadingSpinner({ size = "sm", className = "" }) {
  const sizeClass = size === "lg" ? "h-8 w-8 border-4" : "h-4 w-4 border-2";
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block ${sizeClass} rounded-full border-brand-300 border-t-brand-600 animate-spin ${className}`}
    />
  );
}
