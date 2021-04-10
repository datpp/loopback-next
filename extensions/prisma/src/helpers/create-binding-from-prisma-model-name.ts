import {Binding} from '@loopback/core';
import {PrismaBindings} from '../keys';
export function createBindingFromPrismaModelName<MT = object>(
  modelObj: MT,
  modelName: string,
): Binding<MT> {
  return new Binding(`${PrismaBindings.PRISMA_MODEL_NAMESPACE}.${modelName}`)
    .to(modelObj)
    .tag(PrismaBindings.PRISMA_MODEL_TAG);
}
