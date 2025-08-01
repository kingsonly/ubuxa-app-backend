import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { S3, Endpoint } from 'aws-sdk';
import * as streamifier from 'streamifier';
import axios from 'axios';
import { createReadStream } from 'fs';


@Injectable()
export class StorageService {
    private readonly provider: string;
    private readonly s3: S3;

    constructor(private readonly configService: ConfigService) {
        // this.provider = this.configService.get<string>('STORAGE_PROVIDER');
        this.provider = this.configService.get<string>('STORAGE_PROVIDER') || 'cloudinary';

         console.log('⚙️ STORAGE_PROVIDER =', this.provider);

        if (this.provider === 'spaces') {
            this.s3 = new S3({
                endpoint: new Endpoint(this.configService.get<string>('DO_SPACES_ENDPOINT')),
                accessKeyId: this.configService.get<string>('DO_SPACES_KEY'),
                secretAccessKey: this.configService.get<string>('DO_SPACES_SECRET'),
            });
        } else {
            cloudinary.config({
                cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
                api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
                api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
            });
        }
    }

    // async uploadFile(file: Express.Multer.File, folder: string = ''): Promise<any> {

    //     if (this.provider === 'cloudinary') {
    //         return new Promise((resolve, reject) => {
    //             const uploadStream = cloudinary.uploader.upload_stream(
    //                 {
    //                     folder,
    //                     resource_type: "auto"

    //                 },
    //                 (error, result) => {
    //                     if (error) reject(error);
    //                     else resolve(result);
    //                 }
    //             );

    //             streamifier.createReadStream(file.buffer).pipe(uploadStream);
    //         });
    //     } else if (this.provider === 'spaces') {
    //         const params = {
    //             Bucket: this.configService.get<string>('DO_SPACES_BUCKET'),
    //             Key: `${folder}/${file.originalname}`,
    //             Body: file.buffer, // Correctly using the buffer
    //             ACL: 'public-read',
    //             ContentType: file.mimetype, // Ensure correct file type
    //         };
    //         return this.s3.upload(params).promise();
    //     } else {
    //         throw new Error('Unsupported storage provider');
    //     }
    // }



    async uploadFile(file: Express.Multer.File, folder = ''): Promise<any> {
        // pick the right input stream
        const inputStream = file.buffer
            ? streamifier.createReadStream(file.buffer)
            : createReadStream(file.path);

        if (this.provider === 'cloudinary') {
            return new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder, resource_type: 'auto' },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );

                inputStream.pipe(uploadStream);
            });

        } else if (this.provider === 'spaces') {
            const params = {
                Bucket: this.configService.get<string>('DO_SPACES_BUCKET'),
                Key: `${folder}/${file.originalname}`,
                Body: inputStream,         // pass the stream here!
                ACL: 'public-read',
                ContentType: file.mimetype,
            };
            return this.s3.upload(params).promise();
        } else {
            throw new Error('Unsupported storage provider');
        }
    }


    async deleteFile(fileKey: string): Promise<any> {
        if (this.provider === 'cloudinary') {
            const publicId = this.extractPublicId(fileKey);
            return cloudinary.uploader.destroy(publicId);
        } else if (this.provider === 'spaces') {
            const params = {
                Bucket: this.configService.get<string>('DO_SPACES_BUCKET'),
                Key: this.extractFilePath(fileKey),
            };
            return this.s3.deleteObject(params).promise();
        } else {
            throw new Error('Unsupported storage provider');
        }

    }

    private extractPublicId(url: string): string {
        return url.split('/').slice(-2).join('/').split('.')[0]; // Extract public_id from URL
    }

    private extractFilePath(url: string): string {
        return url.replace("https://my-space.nyc3.digitaloceanspaces.com/", ""); // Adjust for your space
    }
    async downloadFile(fileKey: string): Promise<Buffer> {
        if (this.provider === 'spaces') {
            const params = {
                Bucket: this.configService.get<string>('DO_SPACES_BUCKET'),
                Key: this.extractFilePath(fileKey),
            };
            const data = await this.s3.getObject(params).promise();
            return data.Body as Buffer;
        } else {
            // Cloudinary: fileKey is a URL
            const resp = await axios.get(fileKey, { responseType: 'arraybuffer' });
            return Buffer.from(resp.data);
        }
    }
}
