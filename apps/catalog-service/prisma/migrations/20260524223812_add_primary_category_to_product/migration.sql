-- AlterTable
ALTER TABLE "products" ADD COLUMN     "primaryCategoryId" VARCHAR(100);

-- CreateIndex
CREATE INDEX "products_primaryCategoryId_idx" ON "products"("primaryCategoryId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
