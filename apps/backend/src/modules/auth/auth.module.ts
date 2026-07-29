import { Module } from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [FirebaseAdminService, FirebaseAuthGuard, RolesGuard],
  exports: [FirebaseAdminService, FirebaseAuthGuard, RolesGuard],
})
export class AuthModule {}
