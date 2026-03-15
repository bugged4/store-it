import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { User } from '@/lib/models';

export async function POST(){
    try{
        await connectDB();
        
    }

}