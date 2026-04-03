import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { requestId, email, name, dept, tel } = await req.json()

    // Service Role 클라이언트 (서버에서만 사용)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. 임시 비밀번호 생성
    const tempPassword = 'Erp' + Math.random().toString(36).slice(2, 8).toUpperCase() + '!'

    // 2. Supabase Auth 계정 생성
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name }
    })

    if (createError) {
      // 이미 계정이 있는 경우
      if (createError.message.includes('already')) {
        // 기존 계정 활성화만
        const { data: existUser } = await supabaseAdmin.auth.admin.listUsers()
        const found = existUser?.users.find(u => u.email === email)
        if (found) {
          await supabaseAdmin.from('profiles').update({
            name, dept, tel, role: 'staff', status: 'active'
          }).eq('id', found.id)
          await supabaseAdmin.from('signup_requests').update({ status: 'approved' }).eq('id', requestId)
          return NextResponse.json({ success: true, tempPassword: '기존 비밀번호 사용', existing: true })
        }
      }
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    // 3. profiles 테이블 업데이트
    if (userData.user) {
      await supabaseAdmin.from('profiles').update({
        name, dept: dept || '미배정', tel: tel || '',
        role: 'staff', status: 'active'
      }).eq('id', userData.user.id)
    }

    // 4. signup_requests 상태 업데이트
    await supabaseAdmin.from('signup_requests').update({ status: 'approved' }).eq('id', requestId)

    return NextResponse.json({ success: true, tempPassword })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
