-- CreateTable
CREATE TABLE "bed_temperatures" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" INTEGER NOT NULL,
    "room" REAL,
    "humidity" REAL,
    "left_bed" REAL,
    "left_out" REAL,
    "left_cen" REAL,
    "left_in" REAL,
    "left_side" REAL,
    "left_water" REAL,
    "left_water_target" REAL,
    "left_setpoint" REAL,
    "left_power" REAL,
    "left_on" BOOLEAN,
    "left_present" BOOLEAN,
    "right_bed" REAL,
    "right_out" REAL,
    "right_cen" REAL,
    "right_in" REAL,
    "right_side" REAL,
    "right_water" REAL,
    "right_water_target" REAL,
    "right_setpoint" REAL,
    "right_power" REAL,
    "right_on" BOOLEAN,
    "right_present" BOOLEAN
);

-- CreateIndex
CREATE UNIQUE INDEX "bed_temperatures_timestamp_key" ON "bed_temperatures"("timestamp");

