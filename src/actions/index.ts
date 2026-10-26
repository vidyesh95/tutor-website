// src/actions/index.ts
import { auth } from './auth';
import { lessonActions } from './lessons';
import { structureActions } from './structure';

export const server = {
  ...auth,
  ...lessonActions,
  ...structureActions,
};
