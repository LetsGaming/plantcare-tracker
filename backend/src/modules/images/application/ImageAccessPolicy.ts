/**
 * modules/images/application/ImageAccessPolicy.ts
 *
 * Who may see and change the images of an entity.
 *
 *  - View: everything public, plus the caller's own private entities.
 *    An entity the caller cannot see answers exactly like a missing one.
 *  - Modify: the owner of a plant or substrate; only admins for the
 *    shared component catalogue.
 */

import { ForbiddenError, NotFoundError } from '../../../core/errors';
import type { EntityType, ImageActor, ImageEntityInfo, ImageEntityLookup } from '../domain/Image';

const ENTITY_LABEL: Record<EntityType, string> = {
  plant: 'Plant',
  substrate: 'Substrate',
  component: 'Component',
};

const isVisibleTo = (info: ImageEntityInfo, actor: ImageActor): boolean =>
  info.isPublic || info.ownerId === actor.id;

const mayModify = (entityType: EntityType, info: ImageEntityInfo, actor: ImageActor): boolean =>
  entityType === 'component' ? actor.role.toLowerCase() === 'admin' : info.ownerId === actor.id;

export class ImageAccessPolicy {
  constructor(private readonly entities: ImageEntityLookup) {}

  async assertCanView(entityType: EntityType, entityId: number, actor: ImageActor): Promise<void> {
    await this.visibleEntity(entityType, entityId, actor);
  }

  async assertCanModify(
    entityType: EntityType,
    entityId: number,
    actor: ImageActor,
  ): Promise<void> {
    const info = await this.visibleEntity(entityType, entityId, actor);
    if (!mayModify(entityType, info, actor)) {
      throw new ForbiddenError(`You may not change the images of this ${entityType}`);
    }
  }

  private async visibleEntity(
    entityType: EntityType,
    entityId: number,
    actor: ImageActor,
  ): Promise<ImageEntityInfo> {
    const info = await this.entities.find(entityType, entityId);
    if (!info || !isVisibleTo(info, actor)) throw new NotFoundError(ENTITY_LABEL[entityType]);
    return info;
  }
}
