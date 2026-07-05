import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

export function PublicHeader() {
  return (
    <header className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/qlogo_icon.png"
            alt="Quest-On Logo"
            width={32}
            height={32}
            sizes="32px"
            className="h-8 w-8"
            priority
          />
          <span className="text-xl font-bold text-gray-900">Quest-On</span>
        </Link>

        <div className="flex items-center gap-2">
          <LanguageSwitcher variant="compact" />
          <Link href="/sign-in">
            <Button variant="outline" size="sm">
              로그인
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">회원가입</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
