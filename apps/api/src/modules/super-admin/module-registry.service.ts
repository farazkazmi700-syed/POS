import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformModule } from './schemas/platform-module.schema';
import { isExecutableModule, MODULE_MANIFESTS } from './module-manifests';

@Injectable()
export class ModuleRegistryService implements OnModuleInit {
  constructor(@InjectModel(PlatformModule.name) private readonly modules: Model<PlatformModule>) {}

  async onModuleInit() {
    // Key's unique index plus atomic upsert makes repeated startup safe. Never reset an operator's disable switch.
    await this.modules.init();
    for (const manifest of MODULE_MANIFESTS) {
      const { key, ...metadata } = manifest;
      try {
        await this.modules.updateOne({ key }, {
          $set: { ...metadata, moduleId: manifest.moduleId, installed: true, managed: true },
          $setOnInsert: { isActive: true, description: '' },
        }, { upsert: true });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        await this.modules.updateOne({ key }, { $set: { ...metadata, installed: true, managed: true } });
      }
    }
    // Retain removed registrations and entitlement history; executable availability is authoritative in this build.
    await this.modules.updateMany({ managed: true, key: { $nin: MODULE_MANIFESTS.map((m) => m.key) } }, { $set: { installed: false } });
  }

  async executableKeys(keys: readonly string[]): Promise<string[]> {
    const rows = await this.modules.find({ key: { $in: keys } }).lean();
    return rows.filter((row) => isExecutableModule(row.key, row)).map((row) => row.key);
  }

  async catalog() {
    const rows = await this.modules.find().sort({ key: 1 }).lean();
    return rows.map((row) => ({ ...row, builtin: MODULE_MANIFESTS.some((m) => m.key === row.key),
      moduleId: MODULE_MANIFESTS.find((m) => m.key === row.key)?.moduleId ?? row.moduleId ?? `MOD-${row.key.toUpperCase()}`,
      installed: MODULE_MANIFESTS.some((m) => m.key === row.key),
      executable: isExecutableModule(row.key, row), releaseState: row.releaseState ?? 'coming-soon', submodules: row.submodules ?? [] }));
  }
}
