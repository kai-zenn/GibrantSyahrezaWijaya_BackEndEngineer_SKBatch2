CREATE TYPE "ApplicantStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

CREATE TABLE "applicants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fullName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "position" VARCHAR(120) NOT NULL,
    "stage" "ApplicantStage" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applicants_pkey" PRIMARY KEY ("id")
);
