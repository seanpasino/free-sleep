-- CreateTable
CREATE TABLE "sleep_ratings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "side" TEXT NOT NULL,
    "night" TEXT NOT NULL,
    "early" INTEGER,
    "late" INTEGER,
    "updated_at" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "sleep_ratings_side_night_key" ON "sleep_ratings"("side", "night");

