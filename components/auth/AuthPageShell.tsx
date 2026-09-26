import Link from "next/link";
import Image from "next/image";

/**
 * 로그인 밖 인증 화면의 틀 — 왼쪽 위 로고, 가운데 카드.
 *
 * 훅이 없어 서버 컴포넌트(`/auth/recovery`, `/reset-password` 의 판정 결과)와
 * 클라이언트 폼 양쪽에서 같이 쓴다. 비밀번호 복구 화면이 셋으로 늘면서 같은
 * 마크업이 세 번 적히게 돼 뺐다.
 */
export function AuthPageShell({
  logoAlt,
  children,
}: {
  logoAlt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background p-8">
      <Link href="/" className="flex items-center gap-2 self-start">
        <Image
          src="/qstn_logo_svg.svg"
          alt={logoAlt}
          width={30}
          height={30}
          className="w-8 h-8"
          priority
        />
        <span className="text-lg font-bold text-foreground dark:text-white">
          Quest-On
        </span>
      </Link>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-8">{children}</div>
      </div>
    </div>
  );
}
