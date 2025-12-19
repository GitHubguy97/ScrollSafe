// Added React import to resolve the missing namespace 'React'
import React from 'react';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
}