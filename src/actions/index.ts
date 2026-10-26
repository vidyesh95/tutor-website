// src/actions/index.ts
import { auth } from './auth';
import { lessonActions } from './lessons';
import { profileActions } from './profile';
import { structureActions } from './structure';

export const server = {
  ...auth,
  ...lessonActions,
  ...structureActions,
  ...profileActions,
};
