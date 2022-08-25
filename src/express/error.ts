import { Request, Response } from 'express';
import { logger } from '../logger';

export class CustomError {
    message!: string;
    status!: number;
    additionalInfo!: any;
  
    constructor(message: string, status = 500, additionalInfo: any = {}) {
      this.message = message;
      this.status = status;
      this.additionalInfo = additionalInfo
    }
}

export const handleError = (
    err: TypeError | CustomError,
    req: Request,
    res: Response
) => {
    let customError = err;

    if (!(err instanceof CustomError)) {
        customError = new CustomError('An error has occurred');
    }

    logger.error(err);

    res.status((customError as CustomError).status).send(customError);
};
