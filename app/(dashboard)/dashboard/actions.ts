"use server";

import { getDb } from "@/lib/db";

export type ProductVisual = {
  id: string;
  icon: string | null;
  bg_image_url: string | null;
};

export async function getProductVisuals(): Promise<ProductVisual[]> {
  try {
    const sql = await getDb();
    const rows = await sql<ProductVisual[]>`
      SELECT id, icon, bg_image_url FROM products
    `;
    return rows;
  } catch {
    return [];
  }
}
