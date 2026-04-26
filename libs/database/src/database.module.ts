import { DynamicModule, Global, Module } from "@nestjs/common";
import { drizzleProvider } from "./drizzle.provider";
import { DRIZZLE } from "./tokens";

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [drizzleProvider],
      exports: [DRIZZLE],
    };
  }
}
