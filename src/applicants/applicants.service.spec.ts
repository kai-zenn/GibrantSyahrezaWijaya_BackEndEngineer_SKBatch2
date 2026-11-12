import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Applicant, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicantsService } from './applicants.service';
import { ApplicantStage } from './enums/applicant-stage.enum';

const applicantId = '3f2b8c1e-6d4a-4f7b-9a1e-5c2d8e7f0a14';

function buildApplicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: applicantId,
    fullName: 'Andi Pratama',
    email: 'andi@example.com',
    position: 'Backend Engineer Intern',
    stage: ApplicantStage.APPLIED,
    createdAt: new Date('2026-11-11T03:00:00.000Z'),
    updatedAt: new Date('2026-11-11T03:00:00.000Z'),
    ...overrides,
  };
}

function buildPrismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('database error', {
    code,
    clientVersion: 'test',
  });
}

describe('ApplicantsService', () => {
  const prismaMock = {
    applicant: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: ApplicantsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApplicantsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(ApplicantsService);
  });

  describe('create', () => {
    it('persists only the client supplied fields and returns the created record', async () => {
      const created = buildApplicant();
      prismaMock.applicant.create.mockResolvedValue(created);

      const result = await service.create({
        fullName: 'Andi Pratama',
        email: 'andi@example.com',
        position: 'Backend Engineer Intern',
      });

      expect(prismaMock.applicant.create).toHaveBeenCalledWith({
        data: {
          fullName: 'Andi Pratama',
          email: 'andi@example.com',
          position: 'Backend Engineer Intern',
        },
      });
      expect(result).toBe(created);
    });
  });

  describe('findAll', () => {
    it('orders by createdAt descending then id descending', async () => {
      prismaMock.applicant.findMany.mockResolvedValue([]);
      prismaMock.applicant.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10 });

      expect(prismaMock.applicant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('translates page and limit into skip and take', async () => {
      prismaMock.applicant.findMany.mockResolvedValue([]);
      prismaMock.applicant.count.mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 5 });

      expect(prismaMock.applicant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('applies no filter when stage is omitted', async () => {
      prismaMock.applicant.findMany.mockResolvedValue([]);
      prismaMock.applicant.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10 });

      expect(prismaMock.applicant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(prismaMock.applicant.count).toHaveBeenCalledWith({ where: {} });
    });

    it('applies the stage filter to both the list and the count queries', async () => {
      prismaMock.applicant.findMany.mockResolvedValue([]);
      prismaMock.applicant.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        stage: ApplicantStage.INTERVIEW,
      });

      expect(prismaMock.applicant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { stage: ApplicantStage.INTERVIEW } }),
      );
      expect(prismaMock.applicant.count).toHaveBeenCalledWith({
        where: { stage: ApplicantStage.INTERVIEW },
      });
    });

    it('computes pagination metadata from the filtered total', async () => {
      const rows = [buildApplicant()];
      prismaMock.applicant.findMany.mockResolvedValue(rows);
      prismaMock.applicant.count.mockResolvedValue(23);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result).toEqual({
        data: rows,
        meta: { page: 2, limit: 10, total: 23, totalPages: 3 },
      });
    });

    it('reports zero total pages when nothing matches', async () => {
      prismaMock.applicant.findMany.mockResolvedValue([]);
      prismaMock.applicant.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it('keeps the requested page when it is beyond the last page', async () => {
      prismaMock.applicant.findMany.mockResolvedValue([]);
      prismaMock.applicant.count.mockResolvedValue(3);

      const result = await service.findAll({ page: 9, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        page: 9,
        limit: 10,
        total: 3,
        totalPages: 1,
      });
    });
  });

  describe('updateStage', () => {
    it('updates only the stage of the requested applicant', async () => {
      const updated = buildApplicant({ stage: ApplicantStage.INTERVIEW });
      prismaMock.applicant.update.mockResolvedValue(updated);

      const result = await service.updateStage(applicantId, {
        stage: ApplicantStage.INTERVIEW,
      });

      expect(prismaMock.applicant.update).toHaveBeenCalledWith({
        where: { id: applicantId },
        data: { stage: ApplicantStage.INTERVIEW },
      });
      expect(result).toBe(updated);
    });

    it('maps Prisma error P2025 to NotFoundException', async () => {
      prismaMock.applicant.update.mockRejectedValue(buildPrismaError('P2025'));

      await expect(
        service.updateStage(applicantId, { stage: ApplicantStage.HIRED }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not map other Prisma errors to NotFoundException', async () => {
      const error = buildPrismaError('P2002');
      prismaMock.applicant.update.mockRejectedValue(error);

      await expect(
        service.updateStage(applicantId, { stage: ApplicantStage.HIRED }),
      ).rejects.toBe(error);
    });

    it('rethrows unexpected errors unchanged', async () => {
      const error = new Error('connection lost');
      prismaMock.applicant.update.mockRejectedValue(error);

      await expect(
        service.updateStage(applicantId, { stage: ApplicantStage.HIRED }),
      ).rejects.toBe(error);
    });
  });
});
