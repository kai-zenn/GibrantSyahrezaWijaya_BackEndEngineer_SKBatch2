import { IsEnum } from 'class-validator';
import { ApplicantStage } from '../enums/applicant-stage.enum';

export class UpdateApplicantStageDto {
  @IsEnum(ApplicantStage)
  stage: ApplicantStage;
}
