import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AzureADAuthGuard extends AuthGuard('azure-ad') {}
