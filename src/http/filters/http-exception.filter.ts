import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

/**
 * Error response format
 */
interface ErrorField {
  field: string;
  message: string;
}

interface ErrorResponse {
  errors: ErrorField[];
  message?: string;
  statusCode: number;
  timestamp: string;
  path: string;
}

/**
 * Global HTTP Exception Filter
 *
 * Standardizes all error responses in the format:
 * {
 *   errors: [{ field: string, message: string }],
 *   message?: string,
 *   statusCode: number,
 *   timestamp: string,
 *   path: string
 * }
 *
 * Handles:
 * - Validation errors (class-validator) - Converts to field-specific errors
 * - HTTP exceptions - Maps to standardized format
 * - Unknown errors - Returns generic 500 error
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errors: ErrorField[] = [];
    let message: string | undefined;

    // Handle HttpException (includes BadRequestException for validation)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;

        // Handle class-validator validation errors
        if (Array.isArray(responseObj.message)) {
          errors = this.parseValidationErrors(responseObj.message);
          message = 'Validation failed';
        } else if (responseObj.message) {
          // Handle single error message
          errors = [
            {
              field: 'general',
              message: responseObj.message,
            },
          ];
          message = responseObj.message;
        }
      } else if (typeof exceptionResponse === 'string') {
        errors = [
          {
            field: 'general',
            message: exceptionResponse,
          },
        ];
        message = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      // Handle regular Error objects
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );

      errors = [
        {
          field: 'general',
          message: 'Internal server error',
        },
      ];
      message = 'An unexpected error occurred';
    } else {
      // Handle unknown exceptions
      this.logger.error('Unknown exception type', exception);

      errors = [
        {
          field: 'general',
          message: 'Internal server error',
        },
      ];
      message = 'An unexpected error occurred';
    }

    // Build error response
    const errorResponse: ErrorResponse = {
      errors,
      message,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Log error details
    if (status >= 500) {
      this.logger.error(
        `HTTP ${status} Error: ${JSON.stringify(errorResponse)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`HTTP ${status} Error: ${JSON.stringify(errorResponse)}`);
    }

    reply.status(status).send(errorResponse);
  }

  /**
   * Parse class-validator error messages into field-specific errors
   */
  private parseValidationErrors(messages: any[]): ErrorField[] {
    const errors: ErrorField[] = [];

    for (const msg of messages) {
      if (typeof msg === 'string') {
        // Simple string message
        errors.push({
          field: 'general',
          message: msg,
        });
      } else if (typeof msg === 'object' && msg.property && msg.constraints) {
        // class-validator error format
        const field = msg.property;
        const constraintMessages = Object.values(msg.constraints) as string[];

        for (const constraintMsg of constraintMessages) {
          errors.push({
            field,
            message: constraintMsg,
          });
        }
      }
    }

    return errors.length > 0
      ? errors
      : [{ field: 'general', message: 'Validation failed' }];
  }
}
