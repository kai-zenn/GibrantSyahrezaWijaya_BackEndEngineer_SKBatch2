import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApplicantsModule } from '../src/applicants/applicants.module';
import { ApplicantStage } from '../src/applicants/enums/applicant-stage.enum';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  InMemoryPrisma,
  createInMemoryPrisma,
} from './support/in-memory-prisma';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MISSING_APPLICANT_ID = '3f2b8c1e-6d4a-4f7b-9a1e-5c2d8e7f0a14';
const BASE_TIME = Date.UTC(2026, 10, 11, 3, 0, 0);

const validPayload = {
  fullName: 'Andi Pratama',
  email: 'andi@example.com',
  position: 'Backend Engineer Intern',
};

function createTickingClock(): () => Date {
  let tick = 0;
  return () => new Date(BASE_TIME + tick++ * 1000);
}

function createFixedClock(): () => Date {
  return () => new Date(BASE_TIME);
}

async function createTestApp(prisma: InMemoryPrisma): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ApplicantsModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

async function createApplicant(
  app: INestApplication,
  overrides: Partial<typeof validPayload> = {},
): Promise<{ id: string }> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/applicants')
    .send({ ...validPayload, ...overrides })
    .expect(201);
  return response.body;
}

describe('Applicants API (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    prisma = createInMemoryPrisma(createTickingClock());
    app = await createTestApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/applicants', () => {
    it('creates an applicant with the default APPLIED stage', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send(validPayload)
        .expect(201);

      expect(response.body).toEqual({
        id: expect.stringMatching(UUID_PATTERN),
        fullName: 'Andi Pratama',
        email: 'andi@example.com',
        position: 'Backend Engineer Intern',
        stage: 'APPLIED',
        createdAt: '2026-11-11T03:00:00.000Z',
        updatedAt: '2026-11-11T03:00:00.000Z',
      });
    });

    it('trims the name and position and normalizes the email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({
          fullName: '  Andi Pratama  ',
          email: '  Andi.Pratama@Example.COM  ',
          position: '  Backend Engineer Intern  ',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        fullName: 'Andi Pratama',
        email: 'andi.pratama@example.com',
        position: 'Backend Engineer Intern',
      });
    });

    it('allows the same email to apply for more than one position', async () => {
      await createApplicant(app, { position: 'Backend Engineer Intern' });
      await createApplicant(app, { position: 'Data Engineer Intern' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants')
        .expect(200);

      expect(response.body.meta.total).toBe(2);
    });

    it('rejects a body with every required field missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        statusCode: 400,
      });
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'fullName should not be empty',
          'email must be an email',
          'position should not be empty',
        ]),
      );
    });

    it('rejects an invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({ ...validPayload, email: 'not-an-email' })
        .expect(400);

      expect(response.body.message).toContain('email must be an email');
    });

    it('rejects a whitespace-only name', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({ ...validPayload, fullName: '     ' })
        .expect(400);

      expect(response.body.message).toContain('fullName should not be empty');
    });

    it('rejects a whitespace-only position', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({ ...validPayload, position: '     ' })
        .expect(400);

      expect(response.body.message).toContain('position should not be empty');
    });

    it('rejects values that exceed the maximum lengths', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({
          fullName: 'a'.repeat(101),
          email: `${'a'.repeat(250)}@example.com`,
          position: 'a'.repeat(121),
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'fullName must be shorter than or equal to 100 characters',
          'position must be shorter than or equal to 120 characters',
        ]),
      );
    });

    it('answers with 400 instead of failing when fields have the wrong type', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({ fullName: 123, email: 42, position: { title: 'Intern' } })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('rejects unexpected body fields, including stage', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send({ ...validPayload, stage: 'HIRED', extra: true })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'property stage should not exist',
          'property extra should not exist',
        ]),
      );
    });
  });

  describe('GET /api/v1/applicants', () => {
    it('returns an empty page with zero total pages when there are no records', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants')
        .expect(200);

      expect(response.body).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it('defaults to page 1 with 10 records per page', async () => {
      for (let index = 0; index < 12; index++) {
        await createApplicant(app, { fullName: `Applicant ${index}` });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants')
        .expect(200);

      expect(response.body.data).toHaveLength(10);
      expect(response.body.meta).toEqual({
        page: 1,
        limit: 10,
        total: 12,
        totalPages: 2,
      });
    });

    it('returns the remaining records on the last page', async () => {
      for (let index = 0; index < 12; index++) {
        await createApplicant(app, { fullName: `Applicant ${index}` });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants?page=2&limit=10')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({
        page: 2,
        limit: 10,
        total: 12,
        totalPages: 2,
      });
    });

    it('returns an empty list and keeps the page number beyond the last page', async () => {
      await createApplicant(app);

      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants?page=5&limit=10')
        .expect(200);

      expect(response.body).toEqual({
        data: [],
        meta: { page: 5, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it('lists the newest records first', async () => {
      const first = await createApplicant(app, { fullName: 'First Applicant' });
      const second = await createApplicant(app, {
        fullName: 'Second Applicant',
      });
      const third = await createApplicant(app, { fullName: 'Third Applicant' });

      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants')
        .expect(200);

      expect(response.body.data.map((item: { id: string }) => item.id)).toEqual(
        [third.id, second.id, first.id],
      );
    });

    it('breaks createdAt ties by id descending so pages never overlap', async () => {
      const tiedPrisma = createInMemoryPrisma(createFixedClock());
      const tiedApp = await createTestApp(tiedPrisma);
      const findManySpy = jest.spyOn(tiedPrisma.applicant, 'findMany');

      try {
        const created: string[] = [];
        for (let index = 0; index < 6; index++) {
          created.push((await createApplicant(tiedApp)).id);
        }

        const firstPage = await request(tiedApp.getHttpServer())
          .get('/api/v1/applicants?page=1&limit=3')
          .expect(200);
        const secondPage = await request(tiedApp.getHttpServer())
          .get('/api/v1/applicants?page=2&limit=3')
          .expect(200);

        const listedIds = [...firstPage.body.data, ...secondPage.body.data].map(
          (item: { id: string }) => item.id,
        );

        expect(listedIds).toEqual([...created].sort().reverse());
        expect(findManySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
        );
      } finally {
        await tiedApp.close();
      }
    });

    it('filters by stage and reports the filtered total', async () => {
      const first = await createApplicant(app);
      await createApplicant(app);
      const third = await createApplicant(app);

      for (const applicant of [first, third]) {
        await request(app.getHttpServer())
          .patch(`/api/v1/applicants/${applicant.id}/stage`)
          .send({ stage: 'INTERVIEW' })
          .expect(200);
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants?stage=INTERVIEW')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(
        response.body.data.every(
          (item: { stage: string }) => item.stage === 'INTERVIEW',
        ),
      ).toBe(true);
      expect(response.body.meta.total).toBe(2);
    });

    it('accepts the maximum limit of 50', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/applicants?limit=50')
        .expect(200);

      expect(response.body.meta.limit).toBe(50);
    });

    it.each([
      ['page=0', 'page must not be less than 1'],
      ['page=-1', 'page must not be less than 1'],
      ['page=abc', 'page must be an integer number'],
      ['page=1.5', 'page must be an integer number'],
      ['limit=0', 'limit must not be less than 1'],
      ['limit=51', 'limit must not be greater than 50'],
      ['limit=abc', 'limit must be an integer number'],
      [
        'stage=UNKNOWN',
        `stage must be one of the following values: ${Object.values(ApplicantStage).join(', ')}`,
      ],
      ['unknown=value', 'property unknown should not exist'],
    ])('rejects the query string %s', async (query, expectedMessage) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/applicants?${query}`)
        .expect(400);

      expect(response.body.message).toContain(expectedMessage);
    });
  });

  describe('PATCH /api/v1/applicants/:id/stage', () => {
    it('updates the stage and refreshes updatedAt without touching other fields', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/applicants')
        .send(validPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.body.id}/stage`)
        .send({ stage: 'INTERVIEW' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: created.body.id,
        fullName: created.body.fullName,
        email: created.body.email,
        position: created.body.position,
        stage: 'INTERVIEW',
        createdAt: created.body.createdAt,
      });
      expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.body.updatedAt).getTime(),
      );
    });

    it('persists the new stage so later reads return it', async () => {
      const created = await createApplicant(app);

      await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.id}/stage`)
        .send({ stage: 'OFFER' })
        .expect(200);

      const listed = await request(app.getHttpServer())
        .get('/api/v1/applicants')
        .expect(200);

      expect(listed.body.data[0]).toMatchObject({
        id: created.id,
        stage: 'OFFER',
      });
    });

    it.each(Object.values(ApplicantStage))(
      'accepts the stage %s',
      async (stage) => {
        const created = await createApplicant(app);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/applicants/${created.id}/stage`)
          .send({ stage })
          .expect(200);

        expect(response.body.stage).toBe(stage);
      },
    );

    it('allows moving to any stage without a transition sequence', async () => {
      const created = await createApplicant(app);

      await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.id}/stage`)
        .send({ stage: 'HIRED' })
        .expect(200);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.id}/stage`)
        .send({ stage: 'APPLIED' })
        .expect(200);

      expect(response.body.stage).toBe('APPLIED');
    });

    it('rejects an invalid stage', async () => {
      const created = await createApplicant(app);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.id}/stage`)
        .send({ stage: 'PROMOTED' })
        .expect(400);

      expect(response.body.message).toContain(
        `stage must be one of the following values: ${Object.values(ApplicantStage).join(', ')}`,
      );
    });

    it('rejects a missing stage', async () => {
      const created = await createApplicant(app);

      await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.id}/stage`)
        .send({})
        .expect(400);
    });

    it('rejects unexpected body fields', async () => {
      const created = await createApplicant(app);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.id}/stage`)
        .send({ stage: 'INTERVIEW', fullName: 'Changed Name' })
        .expect(400);

      expect(response.body.message).toContain(
        'property fullName should not exist',
      );
    });

    it('rejects a malformed UUID', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/applicants/not-a-uuid/stage')
        .send({ stage: 'INTERVIEW' })
        .expect(400);

      expect(response.body).toEqual({
        message: 'Validation failed (uuid is expected)',
        error: 'Bad Request',
        statusCode: 400,
      });
    });

    it('returns 404 when the UUID is valid but no applicant exists', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${MISSING_APPLICANT_ID}/stage`)
        .send({ stage: 'INTERVIEW' })
        .expect(404);

      expect(response.body).toEqual({
        message: `Applicant with id ${MISSING_APPLICANT_ID} was not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    });

    it('returns a generic 500 without leaking internal details for unexpected failures', async () => {
      const created = await createApplicant(app);
      jest
        .spyOn(prisma.applicant, 'update')
        .mockRejectedValueOnce(
          new Error('connection to postgresql://user:secret@db:5432 refused'),
        );

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/applicants/${created.id}/stage`)
        .send({ stage: 'INTERVIEW' })
        .expect(500);

      expect(response.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(JSON.stringify(response.body)).not.toContain('secret');
    });
  });
});
