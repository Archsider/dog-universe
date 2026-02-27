import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function POST(request: Request) {
  try {
    const { name, email, phone, password, language } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'MISSING_FIELDS', message: 'Required fields missing' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: 'EMAIL_TAKEN', message: 'Email already in use' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        passwordHash,
        role: 'CLIENT',
        language: language ?? 'fr',
      },
    });

    // Create default loyalty grade
    await prisma.loyaltyGrade.create({
      data: {
        clientId: user.id,
        grade: 'BRONZE',
        isOverride: false,
      },
    });

    await logAction({
      userId: user.id,
      action: LOG_ACTIONS.USER_REGISTER,
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'An error occurred' }, { status: 500 });
  }
}
