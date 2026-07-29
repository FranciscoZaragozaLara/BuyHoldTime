import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private firebaseApp: App | null = null;

  onModuleInit() {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      this.firebaseApp = existingApps[0]!;
      return;
    }

    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        this.firebaseApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.logger.log('Firebase Admin SDK initialized with Service Account credentials');
      } else if (process.env.FIREBASE_PROJECT_ID) {
        this.firebaseApp = initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
        this.logger.log(`Firebase Admin SDK initialized with Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
      } else {
        // Fallback default init for dev mode
        this.firebaseApp = initializeApp({
          projectId: 'buyholdtime-app',
        });
        this.logger.log('Firebase Admin SDK initialized with default dev config');
      }
    } catch (err: any) {
      this.logger.warn(`Firebase Admin SDK initialization warning: ${err.message}`);
    }
  }

  getAuth(): Auth {
    if (!this.firebaseApp) {
      return getAuth();
    }
    return getAuth(this.firebaseApp);
  }
}
