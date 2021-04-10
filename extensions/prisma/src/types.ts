// Copyright IBM Corp. 2021. All Rights Reserved.
// Node module: @loopback/prisma
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Prisma} from '.prisma/client';
import {AnyObject, KeyOf} from '@loopback/repository';
import {PrismaBindings} from './keys';

/**
 * Interface defining the options accepted by {@link ./component/PrismaComponent}.
 *
 * @remarks
 * It accepts all values of {@link Prisma.PrismaClientOptions} and
 * `lazyConnect`.
 *
 *
 * ## lazyConnect
 * The `lazyConnect` option emulates the
 * behaviour of LoopBack 4-native connectors to only establish a connection upon
 * the first database request.
 *
 * Setting `lazyConnect: true` will prevent the explicit calling of
 * `PrismaClient.$connect()`, and instead fallback to Prisma's default
 * behaviour.
 *
 * ## Existing PrismaClient
 * If an existing PrismaClient is bound during datasource lifecycle
 * initialisation, only `lazyConnect` will be honored.
 *
 * @defaultValue {@link DEFAULT_PRISMA_COMPONENT_OPTIONS}
 */
export interface PrismaOptions {
  prismaClient?: Prisma.PrismaClientOptions;
  lazyConnect?: boolean;
  models?: {
    namespace?: string;
    tags?: string[];
  };
}

/**
 * The default options used by
 * {@link ./component/PrismaComponent | PrismaComponent}.
 */
export const DEFAULT_PRISMA_OPTIONS: PrismaOptions = {
  lazyConnect: false,
  models: {
    namespace: PrismaBindings.PRISMA_MODEL_NAMESPACE,
    tags: [PrismaBindings.PRISMA_MODEL_TAG],
  },
};

export namespace PrismaGenericTypes {
  export type Filter<MT extends object = AnyObject> =
    | {
        select?: SelectFilter<MT>;
        orderBy?: OrderByFilter;
        skip?: SkipFilter;
        take?: TakeFilter;
        where?: WhereFilter<MT>;
      }
    | {
        include?: IncludeFilter<MT>;
        orderBy?: OrderByFilter;
        skip?: SkipFilter;
        take?: TakeFilter;
        where?: WhereFilter;
      };

  export type WhereFilter<MT extends object = AnyObject> = AndClause<MT> &
    OrClause<MT> &
    Condition<MT>;

  export type Condition<MT extends object = AnyObject> = {
    [prop in KeyOf<MT>]: {
      equals?: string;
    };
  };

  export type AndClause<MT extends object = AnyObject> = {
    AND?: WhereFilter<MT>[];
  };

  export type OrClause<MT extends object = AnyObject> = {
    OR?: WhereFilter<MT>[];
  };

  export type SelectFilter<MT extends object = AnyObject> = Record<
    KeyOf<MT>,
    boolean
  >;
  export type IncludeFilter<MT extends object = AnyObject> = Record<
    KeyOf<MT>,
    Filter | boolean
  >;
  export type OrderByFilter = Record<string, 'asc' | 'desc'>;
  export type SkipFilter = number;
  export type TakeFilter = number;
}
