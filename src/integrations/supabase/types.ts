export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          school_id: string
          target_class_id: string | null
          target_role: string | null
          title: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          school_id: string
          target_class_id?: string | null
          target_role?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          school_id?: string
          target_class_id?: string | null
          target_role?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_target_class_id_fkey"
            columns: ["target_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          marked_by: string
          notes: string | null
          school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date?: string
          id?: string
          marked_by: string
          notes?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          marked_by?: string
          notes?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          id: string
          subject_id: string
        }
        Insert: {
          class_id: string
          id?: string
          subject_id: string
        }
        Update: {
          class_id?: string
          id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          exam_id: string
          id: string
          is_submitted: boolean
          score: number | null
          started_at: string
          student_id: string
          submitted_at: string | null
          total_questions: number | null
        }
        Insert: {
          exam_id: string
          id?: string
          is_submitted?: boolean
          score?: number | null
          started_at?: string
          student_id: string
          submitted_at?: string | null
          total_questions?: number | null
        }
        Update: {
          exam_id?: string
          id?: string
          is_submitted?: boolean
          score?: number | null
          started_at?: string
          student_id?: string
          submitted_at?: string | null
          total_questions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          allow_retake: boolean
          class_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          end_date: string | null
          id: string
          is_published: boolean
          allow_retake: boolean
          school_id: string | null
          start_date: string | null
          subject_id: string
          term_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          allow_retake?: boolean
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          end_date?: string | null
          id?: string
          is_published?: boolean
          allow_retake?: boolean
          school_id?: string | null
          start_date?: string | null
          subject_id: string
          term_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          allow_retake?: boolean
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          end_date?: string | null
          id?: string
          is_published?: boolean
          allow_retake?: boolean
          school_id?: string | null
          start_date?: string | null
          subject_id?: string
          term_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount_paid: number
          created_at: string
          fee_type_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          receipt_number: string | null
          recorded_by: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          fee_type_id: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_number?: string | null
          recorded_by?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          fee_type_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_number?: string | null
          recorded_by?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_types: {
        Row: {
          amount: number
          class_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          school_id: string
          term_id: string | null
        }
        Insert: {
          amount?: number
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          term_id?: string | null
        }
        Update: {
          amount?: number
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_types_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_types_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_categories: {
        Row: {
          created_at: string
          id: string
          max_score: number
          name: string
          school_id: string
          term_id: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_score?: number
          name: string
          school_id: string
          term_id?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          max_score?: number
          name?: string
          school_id?: string
          term_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_categories_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          category_id: string
          class_id: string
          created_at: string
          graded_by: string | null
          id: string
          max_score: number
          remarks: string | null
          school_id: string
          score: number
          student_id: string
          subject_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          class_id: string
          created_at?: string
          graded_by?: string | null
          id?: string
          max_score?: number
          remarks?: string | null
          school_id: string
          score?: number
          student_id: string
          subject_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          class_id?: string
          created_at?: string
          graded_by?: string | null
          id?: string
          max_score?: number
          remarks?: string | null
          school_id?: string
          score?: number
          student_id?: string
          subject_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "grade_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_classes: {
        Row: {
          class_id: string
          created_at: string
          id: string
          instructor_id: string
          school_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          instructor_id: string
          school_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          instructor_id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructor_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_permissions: {
        Row: {
          can_manage_exams: boolean
          can_manage_fees: boolean
          can_manage_grades: boolean
          can_manage_students: boolean
          can_manage_subjects: boolean
          can_manage_timetable: boolean
          can_mark_attendance: boolean
          can_post_announcements: boolean
          can_view_results: boolean
          created_at: string
          id: string
          instructor_id: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          can_manage_exams?: boolean
          can_manage_fees?: boolean
          can_manage_grades?: boolean
          can_manage_students?: boolean
          can_manage_subjects?: boolean
          can_manage_timetable?: boolean
          can_mark_attendance?: boolean
          can_post_announcements?: boolean
          can_view_results?: boolean
          created_at?: string
          id?: string
          instructor_id: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          can_manage_exams?: boolean
          can_manage_fees?: boolean
          can_manage_grades?: boolean
          can_manage_students?: boolean
          can_manage_subjects?: boolean
          can_manage_timetable?: boolean
          can_mark_attendance?: boolean
          can_post_announcements?: boolean
          can_view_results?: boolean
          created_at?: string
          id?: string
          instructor_id?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_students: {
        Row: {
          created_at: string
          id: string
          parent_id: string
          school_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
          school_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          class_id: string | null
          class_name: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          full_name: string
          gender: string | null
          id: string
          last_name: string
          middle_name: string | null
          nationality: string | null
          parent_name: string | null
          school_id: string | null
          subjects_offered: string[] | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          address?: string | null
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          full_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          middle_name?: string | null
          nationality?: string | null
          parent_name?: string | null
          school_id?: string | null
          subjects_offered?: string[] | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          address?: string | null
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          full_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          middle_name?: string | null
          nationality?: string | null
          parent_name?: string | null
          school_id?: string | null
          subjects_offered?: string[] | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          correct_option: string
          created_at: string
          exam_id: string
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_order: number
          question_text: string
        }
        Insert: {
          correct_option: string
          created_at?: string
          exam_id: string
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_order?: number
          question_text: string
        }
        Update: {
          correct_option?: string
          created_at?: string
          exam_id?: string
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_order?: number
          question_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      school_referrals: {
        Row: {
          commission_amount: number
          commission_paid: boolean
          created_at: string
          id: string
          notes: string | null
          officer_id: string
          school_id: string
        }
        Insert: {
          commission_amount?: number
          commission_paid?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          officer_id: string
          school_id: string
        }
        Update: {
          commission_amount?: number
          commission_paid?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          officer_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_referrals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          id: string
          key: string
          school_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          school_id?: string | null
          updated_at?: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          school_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_answers: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          question_id: string
          selected_option: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          selected_option?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          selected_option?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          allow_calculator: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          allow_calculator?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          allow_calculator?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_entries: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          id: string
          instructor_id: string | null
          period_id: string
          school_id: string
          subject_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          id?: string
          instructor_id?: string | null
          period_id: string
          school_id: string
          subject_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          id?: string
          instructor_id?: string | null
          period_id?: string
          school_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "timetable_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_periods: {
        Row: {
          created_at: string
          end_time: string
          id: string
          name: string
          period_order: number
          school_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          name: string
          period_order?: number
          school_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          period_order?: number
          school_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      student_list_view: {
        Row: {
          address: string | null
          class_id: string | null
          class_name: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          last_name: string | null
          middle_name: string | null
          nationality: string | null
          parent_name: string | null
          school_id: string | null
          subjects_offered: string[] | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      confirm_user_email: { Args: { _user_id: string }; Returns: undefined }
      create_school_user: {
        Args: {
          _email: string
          _full_name: string
          _password: string
          _role: string
          _school_id: string
          _username?: string
        }
        Returns: string
      }
      delete_school_user: { Args: { _user_id: string }; Returns: undefined }
      get_all_school_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          role: string
          school_id: string
          school_name: string
          user_id: string
          username: string
        }[]
      }
      get_email_by_user_id: { Args: { _user_id: string }; Returns: string }
      get_email_by_username: {
        Args: { _school_id: string; _username: string }
        Returns: string
      }
      get_school_parents: {
        Args: { _school_id: string }
        Returns: {
          created_at: string
          first_name: string
          full_name: string
          id: string
          last_name: string
          school_id: string
          updated_at: string
          user_id: string
          username: string
        }[]
      }
      get_school_students: {
        Args: { _school_id: string }
        Returns: {
          address: string
          class_id: string
          class_name: string
          created_at: string
          date_of_birth: string
          first_name: string
          full_name: string
          gender: string
          id: string
          last_name: string
          middle_name: string
          nationality: string
          parent_name: string
          school_id: string
          subjects_offered: string[]
          updated_at: string
          user_id: string
          username: string
        }[]
      }
      get_school_students_only: {
        Args: { _school_id: string }
        Returns: {
          class_id: string
          full_name: string
          user_id: string
          username: string
        }[]
      }
      get_user_emails_by_ids: {
        Args: { _user_ids: string[] }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_user_school_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_exam_attempt: {
        Args: { _exam_id: string; _student_id: string }
        Returns: string
      }
      update_school_user: {
        Args: {
          _full_name: string
          _role: string
          _school_id: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "student"
        | "instructor"
        | "super_admin"
        | "parent"
        | "outreach_officer"
      attendance_status: "present" | "absent" | "late" | "excused"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "student",
        "instructor",
        "super_admin",
        "parent",
        "outreach_officer",
      ],
      attendance_status: ["present", "absent", "late", "excused"],
    },
  },
} as const
