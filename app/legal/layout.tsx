export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen surface-page-gradient-soft">
      <div className="container mx-auto max-w-4xl px-4 py-12 lg:py-16">
        {children}
      </div>
    </div>
  );
}

