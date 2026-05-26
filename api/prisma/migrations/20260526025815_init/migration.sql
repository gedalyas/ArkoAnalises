-- CreateEnum
CREATE TYPE "DiagnosisStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'ERROR');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('CREDIT_CARD', 'BANK');

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "leadName" TEXT,
    "leadEmail" TEXT,
    "questionnaire" JSONB,
    "status" "DiagnosisStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "errorMsg" TEXT,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diagnosisId" TEXT NOT NULL,
    "rawLine" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source" "TransactionSource" NOT NULL,
    "category" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_diagnosisId_idx" ON "Transaction"("diagnosisId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "Diagnosis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
