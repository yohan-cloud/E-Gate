from django.contrib import admin
from .models import User, ResidentProfile

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'is_resident', 'is_admin', 'is_staff')
    search_fields = ('username', 'email')

@admin.register(ResidentProfile)
class ResidentProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'barangay_id', 'address', 'birthdate', 'expiry_date')
    search_fields = ('user__username', 'barangay_id')
