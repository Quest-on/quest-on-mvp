import type { MetadataRoute } from "next";
import { isProductionApp } from "@/lib/app-env";

/**
 * 프로덕션이 아닌 배포(스테이징/프리뷰)는 색인 금지.
 * 스테이징 URL 이 검색결과에 뜨면 학생이 실제 시험을 스테이징에서 치는 사고가 난다.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionApp()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/instructor/", "/student/"],
      },
    ],
  };
}
