import { PageHeader } from "@/components/page-header";

export function ComingSoon({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="m-6 rounded-xl border border-dashed border-panel-border p-10 text-center">
        <div className="mb-2 text-sm font-semibold text-accent">{phase}</div>
        <p className="mx-auto max-w-md text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
