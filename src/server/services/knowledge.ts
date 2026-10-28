import type { KnowledgeArticle } from "@/shared/types";
import { listArticles, type SqlDatabase } from "../db/database.ts";
import { tokens } from "./classification.ts";

export interface KnowledgeMatch {
  article: KnowledgeArticle;
  score: number;
}

export async function searchKnowledge(db: SqlDatabase, query: string): Promise<KnowledgeMatch[]> {
  const queryWords = tokens(query);
  if (queryWords.size === 0) return [];
  return (await listArticles(db))
    .map((article) => {
      const searchText = `${article.title} ${article.content} ${article.keywords.join(" ")}`;
      const words = tokens(searchText);
      const keywordHits = article.keywords.filter((keyword) => query.toLocaleLowerCase("pt-BR").includes(keyword.toLocaleLowerCase("pt-BR"))).length;
      const hits = [...queryWords].filter((word) => words.has(word)).length;
      return { article, score: hits / queryWords.size + keywordHits * 0.4 };
    })
    .filter((match) => match.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
