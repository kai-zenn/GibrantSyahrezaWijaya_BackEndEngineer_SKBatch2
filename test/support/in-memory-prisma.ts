import { randomUUID } from 'node:crypto';
import { ApplicantStage } from '../../src/applicants/enums/applicant-stage.enum';
import { Applicant, Prisma } from '../../src/generated/prisma/client';

type SortField = 'createdAt' | 'id';
type SortDirection = 'asc' | 'desc';
type OrderBy = Partial<Record<SortField, SortDirection>>[];
type StageFilter = { stage?: ApplicantStage };

interface FindManyArgs {
  where?: StageFilter;
  orderBy?: OrderBy;
  skip?: number;
  take?: number;
}

interface CountArgs {
  where?: StageFilter;
}

interface CreateArgs {
  data: { fullName: string; email: string; position: string };
}

interface UpdateArgs {
  where: { id: string };
  data: { stage: ApplicantStage };
}

export interface InMemoryPrisma {
  applicant: {
    create(args: CreateArgs): Promise<Applicant>;
    findMany(args: FindManyArgs): Promise<Applicant[]>;
    count(args: CountArgs): Promise<number>;
    update(args: UpdateArgs): Promise<Applicant>;
  };
}

function sortValue(applicant: Applicant, field: SortField): number | string {
  return field === 'createdAt' ? applicant.createdAt.getTime() : applicant.id;
}

function buildComparator(orderBy: OrderBy) {
  return (left: Applicant, right: Applicant): number => {
    for (const rule of orderBy) {
      for (const [field, direction] of Object.entries(rule) as [
        SortField,
        SortDirection,
      ][]) {
        const leftValue = sortValue(left, field);
        const rightValue = sortValue(right, field);
        if (leftValue === rightValue) {
          continue;
        }
        const order = leftValue < rightValue ? -1 : 1;
        return direction === 'asc' ? order : -order;
      }
    }
    return 0;
  };
}

export function createInMemoryPrisma(
  now: () => Date = () => new Date(),
): InMemoryPrisma {
  const store: Applicant[] = [];

  const matches = (applicant: Applicant, where?: StageFilter): boolean =>
    where?.stage === undefined || applicant.stage === where.stage;

  return {
    applicant: {
      async create({ data }) {
        const timestamp = now();
        const record: Applicant = {
          id: randomUUID(),
          fullName: data.fullName,
          email: data.email,
          position: data.position,
          stage: ApplicantStage.APPLIED,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        store.push(record);
        return { ...record };
      },

      async findMany({ where, orderBy = [], skip = 0, take }) {
        return store
          .filter((applicant) => matches(applicant, where))
          .sort(buildComparator(orderBy))
          .slice(skip, take === undefined ? undefined : skip + take)
          .map((applicant) => ({ ...applicant }));
      },

      async count({ where }) {
        return store.filter((applicant) => matches(applicant, where)).length;
      },

      async update({ where, data }) {
        const record = store.find((applicant) => applicant.id === where.id);
        if (!record) {
          throw new Prisma.PrismaClientKnownRequestError(
            'An operation failed because it depends on one or more records that were required but not found.',
            { code: 'P2025', clientVersion: 'test' },
          );
        }
        record.stage = data.stage;
        record.updatedAt = now();
        return { ...record };
      },
    },
  };
}
