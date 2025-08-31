import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Get configuration service
  const configService = app.get(ConfigService);
  const port = configService.get('API_PORT', 3001);
  const frontendUrl = configService.get('FRONTEND_URL', 'http://localhost:3000');

  // Security middleware
  app.use(helmet());
  app.use(compression());

  // CORS Configuration - HARDENED SECURITY
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')
    : ['http://localhost:3000', 'http://localhost:3001'];
    
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, direct browser access)
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        logger.warn(`🚫 CORS: Blocked request from unauthorized origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], // Removed OPTIONS
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
    maxAge: 3600, // Cache preflight for 1 hour
    optionsSuccessStatus: 200,
  });

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false, // Allow embedding for development
  }));

  // Request size limits
  app.use('/api', (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxSize = req.path.includes('/upload') ? 10 * 1024 * 1024 : 1024 * 1024; // 10MB for uploads, 1MB for others
    
    if (contentLength > maxSize) {
      logger.warn(`🚫 Request too large: ${contentLength} bytes from ${req.ip}`);
      return res.status(413).json({ 
        error: 'Request entity too large',
        maxSize: `${maxSize / (1024 * 1024)}MB`
      });
    }
    next();
  });

  // Request timeout configuration
  app.use((req, res, next) => {
    const timeout = req.path.includes('/upload') ? 120000 : 30000; // 2min for uploads, 30s for others
    res.setTimeout(timeout, () => {
      logger.warn(`⏰ Request timeout: ${req.method} ${req.path} from ${req.ip}`);
      res.status(408).json({ error: 'Request timeout' });
    });
    next();
  });

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const messages = errors.map(error => {
          const constraints = error.constraints;
          return constraints ? Object.values(constraints).join(', ') : 'Validation failed';
        });
        return new Error(`Validation failed: ${messages.join('; ')}`);
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SchedulePro API')
      .setDescription('Professional appointment scheduling platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('organizations', 'Organization management')
      .addTag('meeting-types', 'Meeting type management')
      .addTag('bookings', 'Booking management')
      .addTag('availability', 'Availability management')
      .addTag('calendar-integrations', 'Calendar integration management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  await app.listen(port);

  console.log(`🚀 SchedulePro API is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🌐 Frontend URL: ${frontendUrl}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start the application:', error);
  process.exit(1);
});
