import { ConditionalHeader } from "@/components/ConditionalHeader";
import QueryProvider from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AppAuthProvider } from "@/components/providers/AppAuthProvider";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppAuthProvider>
      <ThemeProvider>
        <QueryProvider>
          <ConditionalHeader />
          {children}
          <Toaster />
        </QueryProvider>
      </ThemeProvider>
    </AppAuthProvider>
  );
}
